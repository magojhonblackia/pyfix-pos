from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime, timezone

from database import get_db
from models.customer import Customer
from models.sale import Sale, Payment
from schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse, CustomerPurchaseItem
from constants import DEV_BUSINESS_ID

router = APIRouter(prefix="/customers", tags=["customers"])


def _to_resp(c: Customer) -> CustomerResponse:
    return CustomerResponse(
        id=c.id,
        name=c.name,
        document_type=c.document_type,
        document_number=c.document_number,
        phone=c.phone,
        email=c.email,
        address=c.address,
    )


@router.get("", response_model=list[CustomerResponse])
def list_customers(q: str = "", db: Session = Depends(get_db)):
    """Lista clientes activos, con búsqueda opcional por nombre o documento."""
    query = db.query(Customer).filter(
        Customer.business_id == DEV_BUSINESS_ID,
        Customer.deleted_at.is_(None),
    )
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Customer.name.ilike(like),
                Customer.document_number.ilike(like),
                Customer.phone.ilike(like),
            )
        )
    customers = query.order_by(Customer.name).all()
    return [_to_resp(c) for c in customers]


@router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    if not data.name.strip():
        raise HTTPException(status_code=422, detail="El nombre es requerido")

    # Duplicate document check
    if data.document_number and data.document_number.strip():
        existing = db.query(Customer).filter(
            Customer.business_id == DEV_BUSINESS_ID,
            Customer.document_number == data.document_number.strip(),
            Customer.deleted_at.is_(None),
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese número de documento")

    c = Customer(
        business_id=DEV_BUSINESS_ID,
        name=data.name.strip(),
        document_type=data.document_type or None,
        document_number=data.document_number.strip() if data.document_number else None,
        phone=data.phone.strip() if data.phone else None,
        email=data.email.strip() if data.email else None,
        address=data.address.strip() if data.address else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _to_resp(c)


@router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: str, data: CustomerUpdate, db: Session = Depends(get_db)):
    c = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.business_id == DEV_BUSINESS_ID,
        Customer.deleted_at.is_(None),
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if data.name is not None:
        c.name = data.name.strip()
    if data.document_type is not None:
        c.document_type = data.document_type or None
    if data.document_number is not None:
        c.document_number = data.document_number.strip() or None
    if data.phone is not None:
        c.phone = data.phone.strip() or None
    if data.email is not None:
        c.email = data.email.strip() or None
    if data.address is not None:
        c.address = data.address.strip() or None

    c.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    return _to_resp(c)


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: str, db: Session = Depends(get_db)):
    c = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.business_id == DEV_BUSINESS_ID,
        Customer.deleted_at.is_(None),
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    c.deleted_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/{customer_id}/purchases", response_model=list[CustomerPurchaseItem])
def get_customer_purchases(customer_id: str, db: Session = Depends(get_db)):
    """Historial de compras del cliente (ventas completadas, más recientes primero)."""
    c = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.business_id == DEV_BUSINESS_ID,
        Customer.deleted_at.is_(None),
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    sales = (
        db.query(Sale)
        .filter(
            Sale.customer_id == customer_id,
            Sale.business_id == DEV_BUSINESS_ID,
            Sale.deleted_at.is_(None),
        )
        .order_by(Sale.created_at.desc())
        .limit(100)
        .all()
    )

    result = []
    for s in sales:
        method = s.payments[0].method if s.payments else "cash"
        result.append(CustomerPurchaseItem(
            id=s.id,
            total=float(s.total),
            items_count=sum(int(float(i.quantity)) for i in s.items),
            payment_method=method,
            status=s.status,
            notes=s.notes,
            created_at=s.created_at,
        ))
    return result
