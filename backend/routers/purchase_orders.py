from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from decimal import Decimal

from database import get_db
from models.supplier import Supplier, PurchaseOrder, PurchaseItem
from models.product import Product
from models.inventory import Inventory, StockMovement
from models.user import User
from schemas.purchase_order import POCreate, POResponse, POItemResponse
from constants import DEV_BUSINESS_ID, DEV_BRANCH_ID
from deps import get_current_user

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])


# ── helpers ────────────────────────────────────────────────────

def _get_stock(db: Session, product_id: str) -> Decimal:
    inv = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.branch_id  == DEV_BRANCH_ID,
    ).first()
    return Decimal(str(inv.quantity)) if inv else Decimal("0")


def _to_resp(po: PurchaseOrder) -> POResponse:
    return POResponse(
        id=po.id,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier.name if po.supplier else "",
        status=po.status,
        total=float(po.total),
        notes=po.notes,
        received_at=po.received_at.isoformat() if po.received_at else None,
        created_at=po.created_at.isoformat(),
        items=[
            POItemResponse(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product else "",
                quantity_ordered=float(item.quantity_ordered),
                quantity_received=float(item.quantity_received),
                unit_cost=float(item.unit_cost),
                total_cost=float(item.total_cost),
            )
            for item in po.items
        ],
    )


# ── routes ─────────────────────────────────────────────────────

@router.get("", response_model=list[POResponse])
def list_purchase_orders(db: Session = Depends(get_db)):
    """Lista todas las órdenes de compra del negocio, más recientes primero."""
    pos = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.business_id == DEV_BUSINESS_ID)
        .order_by(PurchaseOrder.created_at.desc())
        .all()
    )
    # eager-load relationships
    for po in pos:
        _ = po.supplier
        for item in po.items:
            _ = item.product
    return [_to_resp(po) for po in pos]


@router.post("", response_model=POResponse, status_code=201)
def create_purchase_order(data: POCreate, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Crea una nueva orden de compra en estado 'draft'."""
    supplier = db.query(Supplier).filter(
        Supplier.id == data.supplier_id,
        Supplier.business_id == DEV_BUSINESS_ID,
        Supplier.deleted_at.is_(None),
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    if not data.items:
        raise HTTPException(status_code=422, detail="La orden debe tener al menos un ítem")

    # Calculate total
    total = Decimal("0")
    for it in data.items:
        total += Decimal(str(it.quantity_ordered)) * Decimal(str(it.unit_cost))

    po = PurchaseOrder(
        business_id=DEV_BUSINESS_ID,
        supplier_id=data.supplier_id,
        user_id=_u.id,
        status="draft",
        total=total,
        notes=data.notes or None,
    )
    db.add(po)
    db.flush()  # get po.id

    for it in data.items:
        product = db.query(Product).filter(
            Product.id == it.product_id,
            Product.business_id == DEV_BUSINESS_ID,
            Product.deleted_at.is_(None),
        ).first()
        if not product:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"Producto {it.product_id} no encontrado")

        qty = Decimal(str(it.quantity_ordered))
        cost = Decimal(str(it.unit_cost))
        db.add(PurchaseItem(
            purchase_order_id=po.id,
            product_id=it.product_id,
            quantity_ordered=qty,
            quantity_received=Decimal("0"),
            unit_cost=cost,
            total_cost=qty * cost,
        ))

    db.commit()
    db.refresh(po)
    _ = po.supplier
    for item in po.items:
        _ = item.product
    return _to_resp(po)


@router.post("/{po_id}/receive", response_model=POResponse)
def receive_purchase_order(po_id: str, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """
    Recibe todos los ítems de la OC:
    - Suma cantidad al inventario
    - Registra movimiento de stock con referencia a la OC
    - Actualiza costo_price del producto
    - Marca la OC como 'received'
    """
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id,
        PurchaseOrder.business_id == DEV_BUSINESS_ID,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if po.status in ("received", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"La orden ya está en estado '{po.status}'",
        )

    _ = po.supplier
    for item in po.items:
        _ = item.product

    now = datetime.now(timezone.utc)
    notes_prefix = f"OC #{po.id[:8].upper()}"
    if po.supplier:
        notes_prefix += f" · {po.supplier.name}"

    for item in po.items:
        qty = Decimal(str(item.quantity_ordered))
        product = item.product

        # Update inventory
        inv = db.query(Inventory).filter(
            Inventory.product_id == item.product_id,
            Inventory.branch_id  == DEV_BRANCH_ID,
        ).first()

        qty_before = Decimal(str(inv.quantity)) if inv else Decimal("0")
        qty_after  = qty_before + qty

        if inv:
            inv.quantity = qty_after
        else:
            inv = Inventory(
                business_id=DEV_BUSINESS_ID,
                branch_id=DEV_BRANCH_ID,
                product_id=item.product_id,
                quantity=qty_after,
            )
            db.add(inv)

        # Stock movement
        db.add(StockMovement(
            business_id=DEV_BUSINESS_ID,
            branch_id=DEV_BRANCH_ID,
            product_id=item.product_id,
            quantity_delta=qty,
            quantity_before=qty_before,
            quantity_after=qty_after,
            reason="purchase",
            notes=notes_prefix,
            user_id=_u.id,
        ))

        # Update product cost with the new unit cost
        if product:
            product.cost = item.unit_cost
            product.updated_at = now

        # Mark item as fully received
        item.quantity_received = qty

    po.status = "received"
    po.received_at = now

    db.commit()
    db.refresh(po)
    _ = po.supplier
    for item in po.items:
        _ = item.product
    return _to_resp(po)


@router.delete("/{po_id}", response_model=POResponse)
def cancel_purchase_order(po_id: str, db: Session = Depends(get_db)):
    """Cancela una OC (sólo si está en draft o sent)."""
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id,
        PurchaseOrder.business_id == DEV_BUSINESS_ID,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if po.status in ("received", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"No se puede cancelar una orden en estado '{po.status}'",
        )

    _ = po.supplier
    for item in po.items:
        _ = item.product

    po.status = "cancelled"
    db.commit()
    db.refresh(po)
    _ = po.supplier
    for item in po.items:
        _ = item.product
    return _to_resp(po)
