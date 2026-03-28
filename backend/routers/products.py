from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func
from datetime import datetime, timezone
from decimal import Decimal

from database import get_db
from deps import get_current_user, require_role
from models.user import User
from models.product import Product, Category
from models.inventory import Inventory, Batch, StockMovement
from schemas.product import (
    ProductCreate, ProductUpdate, ProductResponse, StockAdjustRequest,
    CategoryCreate, CategoryUpdate, CategoryResponse,
    ProductImportItem, ProductImportResult,
    BulkPriceUpdateRequest, BulkPriceUpdateResult,
)
from constants import DEV_BUSINESS_ID, DEV_BRANCH_ID, DEV_USER_ID

router = APIRouter(prefix="/products", tags=["products"])


def _get_stock(db: Session, product_id: str) -> int:
    inv = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.branch_id == DEV_BRANCH_ID,
    ).first()
    return Decimal(str(inv.quantity)) if inv else Decimal("0")


# ── Categorías (antes del wildcard /{product_id}) ───────────

def _cat_product_counts(db: Session) -> dict[str, int]:
    """Devuelve {category_id: count} de productos activos no eliminados."""
    rows = (
        db.query(Product.category_id, func.count(Product.id))
        .filter(
            Product.business_id == DEV_BUSINESS_ID,
            Product.deleted_at.is_(None),
            Product.is_active == 1,
            Product.category_id.isnot(None),
        )
        .group_by(Product.category_id)
        .all()
    )
    return {row[0]: row[1] for row in rows}


@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Devuelve las categorías activas del negocio con conteo de productos."""
    cats = (
        db.query(Category)
        .filter(
            Category.business_id == DEV_BUSINESS_ID,
            Category.deleted_at.is_(None),
        )
        .order_by(Category.name)
        .all()
    )
    counts = _cat_product_counts(db)
    return [
        CategoryResponse(id=c.id, name=c.name, product_count=counts.get(c.id, 0))
        for c in cats
    ]


@router.post("/categories", response_model=CategoryResponse, status_code=201)
def create_category(data: CategoryCreate, db: Session = Depends(get_db), _u: User = Depends(require_role("admin", "supervisor"))):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "El nombre no puede estar vacío")
    existing = db.query(Category).filter(
        Category.business_id == DEV_BUSINESS_ID,
        Category.name.ilike(name),
        Category.deleted_at.is_(None),
    ).first()
    if existing:
        raise HTTPException(400, f"Ya existe una categoría llamada '{name}'")
    cat = Category(business_id=DEV_BUSINESS_ID, name=name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryResponse(id=cat.id, name=cat.name, product_count=0)


@router.patch("/categories/{cat_id}", response_model=CategoryResponse)
def update_category(cat_id: str, data: CategoryUpdate, db: Session = Depends(get_db), _u: User = Depends(require_role("admin", "supervisor"))):
    cat = db.query(Category).filter(
        Category.id == cat_id,
        Category.business_id == DEV_BUSINESS_ID,
        Category.deleted_at.is_(None),
    ).first()
    if not cat:
        raise HTTPException(404, "Categoría no encontrada")
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(400, "El nombre no puede estar vacío")
        cat.name = name
    db.commit()
    db.refresh(cat)
    counts = _cat_product_counts(db)
    return CategoryResponse(id=cat.id, name=cat.name, product_count=counts.get(cat.id, 0))


@router.delete("/categories/{cat_id}", response_model=CategoryResponse)
def delete_category(cat_id: str, db: Session = Depends(get_db), _u: User = Depends(require_role("admin", "supervisor"))):
    cat = db.query(Category).filter(
        Category.id == cat_id,
        Category.business_id == DEV_BUSINESS_ID,
        Category.deleted_at.is_(None),
    ).first()
    if not cat:
        raise HTTPException(404, "Categoría no encontrada")
    # Desvincular productos para no dejar huérfanos
    db.query(Product).filter(
        Product.category_id == cat_id,
        Product.business_id == DEV_BUSINESS_ID,
    ).update({"category_id": None})
    # Soft-delete
    cat.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return CategoryResponse(id=cat_id, name=cat.name, product_count=0)


@router.get("", response_model=list[ProductResponse])
def list_products(q: str = "", include_inactive: bool = False, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    query = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(Product.deleted_at.is_(None))
        .filter(Product.business_id == DEV_BUSINESS_ID)
    )
    if not include_inactive:
        query = query.filter(Product.is_active == 1)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(Product.name.ilike(pattern), Product.barcode.ilike(pattern))
        )
    products = query.order_by(Product.name).all()

    result = []
    for p in products:
        stock = _get_stock(db, p.id)
        result.append(ProductResponse.from_product(p, stock))
    return result


@router.post("", response_model=ProductResponse, status_code=201)
def create_product(data: ProductCreate, db: Session = Depends(get_db), _u: User = Depends(require_role("admin", "supervisor"))):
    product = Product(
        business_id=DEV_BUSINESS_ID,
        name=data.name,
        price=Decimal(str(data.price)),
        cost=Decimal(str(data.cost_price)),
        barcode=data.barcode or None,
        min_stock=Decimal(str(data.min_stock or 0)),
        category_id=data.category_id or None,
    )
    db.add(product)
    db.flush()

    inv = Inventory(
        business_id=DEV_BUSINESS_ID,
        branch_id=DEV_BRANCH_ID,
        product_id=product.id,
        quantity=Decimal(str(data.stock)),
    )
    db.add(inv)
    db.commit()
    db.refresh(product)

    # eager-load category for response
    if product.category_id:
        _ = product.category  # triggers lazy load within session

    return ProductResponse.from_product(product, data.stock)


@router.post("/import", response_model=ProductImportResult)
def import_products(items: list[ProductImportItem], db: Session = Depends(get_db), _u: User = Depends(require_role("admin", "supervisor"))):
    """
    Importación masiva de productos.
    - Identifica existentes por barcode (si se proporciona) o por nombre (case-insensitive).
    - Crea la categoría si no existe.
    - Si el producto existe → actualiza precio, costo, min_stock, categoría.
    - Si no existe → crea con stock inicial.
    """
    created = updated = skipped = 0
    errors: list[str] = []

    # Cache de categorías (nombre lower → id)
    cat_cache: dict[str, str] = {}

    def get_or_create_category(name: str) -> str | None:
        if not name or not name.strip():
            return None
        key = name.strip().lower()
        if key in cat_cache:
            return cat_cache[key]
        cat = db.query(Category).filter(
            Category.business_id == DEV_BUSINESS_ID,
            Category.deleted_at.is_(None),
        ).filter(Category.name.ilike(name.strip())).first()
        if not cat:
            cat = Category(business_id=DEV_BUSINESS_ID, name=name.strip())
            db.add(cat)
            db.flush()
        cat_cache[key] = cat.id
        return cat.id

    for i, item in enumerate(items):
        row_label = f"Fila {i + 1} ({item.name!r})"
        try:
            if not item.name or not item.name.strip():
                errors.append(f"{row_label}: nombre requerido")
                skipped += 1
                continue
            if item.price <= 0:
                errors.append(f"{row_label}: precio debe ser > 0")
                skipped += 1
                continue

            cat_id = get_or_create_category(item.category_name)

            # Buscar producto existente
            existing = None
            if item.barcode and item.barcode.strip():
                existing = db.query(Product).filter(
                    Product.business_id == DEV_BUSINESS_ID,
                    Product.barcode == item.barcode.strip(),
                    Product.deleted_at.is_(None),
                ).first()
            if not existing:
                existing = db.query(Product).filter(
                    Product.business_id == DEV_BUSINESS_ID,
                    Product.deleted_at.is_(None),
                ).filter(Product.name.ilike(item.name.strip())).first()

            if existing:
                # Actualizar
                existing.price      = Decimal(str(item.price))
                existing.cost       = Decimal(str(item.cost_price))
                existing.min_stock  = Decimal(str(item.min_stock))
                existing.category_id = cat_id
                if item.barcode and item.barcode.strip():
                    existing.barcode = item.barcode.strip()
                existing.updated_at = datetime.now(timezone.utc)
                updated += 1
            else:
                # Crear nuevo
                p = Product(
                    business_id=DEV_BUSINESS_ID,
                    name=item.name.strip(),
                    price=Decimal(str(item.price)),
                    cost=Decimal(str(item.cost_price)),
                    barcode=item.barcode.strip() if item.barcode else None,
                    min_stock=Decimal(str(item.min_stock)),
                    category_id=cat_id,
                )
                db.add(p)
                db.flush()

                db.add(Inventory(
                    business_id=DEV_BUSINESS_ID,
                    branch_id=DEV_BRANCH_ID,
                    product_id=p.id,
                    quantity=Decimal(str(item.stock)),
                ))
                created += 1

        except Exception as exc:
            errors.append(f"{row_label}: {str(exc)}")
            skipped += 1

    db.commit()
    return ProductImportResult(created=created, updated=updated, skipped=skipped, errors=errors)


@router.patch("/bulk-price-update", response_model=BulkPriceUpdateResult)
def bulk_price_update(data: BulkPriceUpdateRequest, db: Session = Depends(get_db), _u: User = Depends(require_role("admin", "supervisor"))):
    """
    Ajusta precio de venta, costo, o ambos para un lote de productos.
    Aplica un % de cambio y opcionalmente redondea al múltiplo indicado.
    """
    if not (-90 <= data.pct_change <= 500):
        raise HTTPException(400, "pct_change debe estar entre -90 y 500")
    if data.field not in ("price", "cost_price", "both"):
        raise HTTPException(400, "field debe ser 'price', 'cost_price' o 'both'")

    query = db.query(Product).filter(
        Product.business_id == DEV_BUSINESS_ID,
        Product.deleted_at.is_(None),
        Product.is_active == 1,
    )
    if data.category_id:
        query = query.filter(Product.category_id == data.category_id)

    products = query.all()
    factor   = Decimal(str(1 + data.pct_change / 100))
    rt       = data.round_to or 0
    updated  = 0

    def _apply(value: Decimal) -> Decimal:
        new_val = value * factor
        if rt > 0:
            # Redondear al múltiplo más cercano
            new_val = Decimal(str(round(float(new_val) / rt) * rt))
        return max(Decimal("0.01"), new_val.quantize(Decimal("0.01")))

    for p in products:
        changed = False
        if data.field in ("price", "both") and p.price:
            p.price = _apply(Decimal(str(p.price)))
            changed = True
        if data.field in ("cost_price", "both") and p.cost:
            p.cost = _apply(Decimal(str(p.cost)))
            changed = True
        if changed:
            p.updated_at = datetime.now(timezone.utc)
            updated += 1

    db.commit()
    return BulkPriceUpdateResult(updated=updated, skipped=len(products) - updated)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(product_id: str, data: ProductUpdate, db: Session = Depends(get_db), _u: User = Depends(require_role("admin", "supervisor"))):
    product = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(
            Product.id == product_id,
            Product.business_id == DEV_BUSINESS_ID,
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if data.name is not None:
        product.name = data.name
    if data.price is not None:
        product.price = Decimal(str(data.price))
    if data.cost_price is not None:
        product.cost = Decimal(str(data.cost_price))
    if data.barcode is not None:
        product.barcode = data.barcode
    if data.is_active is not None:
        product.is_active = 1 if data.is_active else 0
    if data.category_id is not None:
        product.category_id = data.category_id
    if data.min_stock is not None:
        product.min_stock = Decimal(str(data.min_stock))

    product.updated_at = datetime.now(timezone.utc)

    if data.stock is not None:
        inv = db.query(Inventory).filter(
            Inventory.product_id == product_id,
            Inventory.branch_id == DEV_BRANCH_ID,
        ).first()
        qty_before = Decimal(str(inv.quantity)) if inv else Decimal("0")
        qty_after  = Decimal(str(data.stock))
        if inv:
            inv.quantity = qty_after
        else:
            db.add(Inventory(
                business_id=DEV_BUSINESS_ID,
                branch_id=DEV_BRANCH_ID,
                product_id=product_id,
                quantity=qty_after,
            ))
        db.add(StockMovement(
            business_id=DEV_BUSINESS_ID,
            branch_id=DEV_BRANCH_ID,
            product_id=product_id,
            quantity_delta=qty_after - qty_before,
            quantity_before=qty_before,
            quantity_after=qty_after,
            reason="count_correction",
            notes="Ajuste desde edición de producto",
            user_id=_u.id,
        ))

    db.commit()
    db.refresh(product)
    # re-load category after commit
    _ = product.category

    stock = _get_stock(db, product_id)
    return ProductResponse.from_product(product, stock)


@router.patch("/{product_id}/stock", response_model=ProductResponse)
def adjust_stock(product_id: str, data: StockAdjustRequest, db: Session = Depends(get_db), _u: User = Depends(require_role("admin", "supervisor"))):
    """Ajuste de stock por delta (+entrada / -merma). No reemplaza el stock absoluto."""
    product = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(
            Product.id == product_id,
            Product.business_id == DEV_BUSINESS_ID,
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    inv = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.branch_id == DEV_BRANCH_ID,
    ).first()

    delta      = Decimal(str(data.delta))
    qty_before = Decimal(str(inv.quantity)) if inv else Decimal("0")

    if delta < 0 and (qty_before + delta) < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente. Disponible: {float(qty_before):.3g}, ajuste: {float(delta):.3g}",
        )

    if inv:
        inv.quantity = qty_before + delta
    else:
        db.add(Inventory(
            business_id=DEV_BUSINESS_ID,
            branch_id=DEV_BRANCH_ID,
            product_id=product_id,
            quantity=delta,
        ))

    qty_after = qty_before + delta

    # Crear lote FIFO cuando es una compra con delta positivo
    batch_id = None
    if data.reason == "purchase" and delta > 0:
        expires_dt = None
        if data.expires_at:
            try:
                expires_dt = datetime.fromisoformat(data.expires_at).replace(tzinfo=timezone.utc)
            except ValueError:
                pass
        batch = Batch(
            business_id=DEV_BUSINESS_ID,
            product_id=product_id,
            lot_number=data.lot_number or None,
            quantity=delta,
            remaining=delta,
            cost_per_unit=Decimal(str(data.cost_per_unit)) if data.cost_per_unit else Decimal("0"),
            expires_at=expires_dt,
            received_at=datetime.now(timezone.utc),
        )
        db.add(batch)
        db.flush()  # obtener batch.id antes del commit
        batch_id = batch.id

    # Registrar movimiento
    db.add(StockMovement(
        business_id=DEV_BUSINESS_ID,
        branch_id=DEV_BRANCH_ID,
        product_id=product_id,
        quantity_delta=delta,
        quantity_before=qty_before,
        quantity_after=qty_after,
        reason=data.reason,
        notes=data.notes or data.reason,
        user_id=_u.id,
        batch_id=batch_id,
    ))

    db.commit()
    db.refresh(product)
    stock = _get_stock(db, product_id)
    return ProductResponse.from_product(product, stock)


@router.get("/{product_id}/movements")
def list_movements(product_id: str, limit: int = 50, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Historial de movimientos de stock para un producto."""
    movements = (
        db.query(StockMovement)
        .filter(
            StockMovement.product_id == product_id,
            StockMovement.business_id == DEV_BUSINESS_ID,
        )
        .order_by(StockMovement.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id":              m.id,
            "created_at":      m.created_at.isoformat(),
            "reason":          m.reason,
            "quantity_delta":  float(m.quantity_delta),
            "quantity_before": float(m.quantity_before),
            "quantity_after":  float(m.quantity_after),
            "notes":           m.notes,
            "sale_id":         m.sale_id,
        }
        for m in movements
    ]


@router.get("/low-stock")
def list_low_stock(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Productos con stock <= min_stock (sólo los que tienen min_stock > 0)."""
    products = (
        db.query(Product)
        .filter(
            Product.business_id == DEV_BUSINESS_ID,
            Product.is_active == 1,
            Product.deleted_at.is_(None),
            Product.min_stock > 0,
        )
        .order_by(Product.name)
        .all()
    )
    alerts = []
    for p in products:
        stock = _get_stock(db, p.id)
        if stock <= Decimal(str(p.min_stock)):
            alerts.append({
                "id":        p.id,
                "name":      p.name,
                "stock":     stock,
                "min_stock": float(p.min_stock),
            })
    return {"count": len(alerts), "products": alerts}


@router.get("/all", response_model=list[ProductResponse])
def list_all_products(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Todos los productos incluyendo inactivos — para página de inventario."""
    products = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(
            Product.business_id == DEV_BUSINESS_ID,
            Product.deleted_at.is_(None),
        )
        .order_by(Product.name)
        .all()
    )
    return [ProductResponse.from_product(p, _get_stock(db, p.id)) for p in products]
