from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from database import get_db
from models.supplier import Supplier
from schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from constants import DEV_BUSINESS_ID

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def _to_resp(s: Supplier) -> SupplierResponse:
    return SupplierResponse(
        id=s.id,
        name=s.name,
        nit=s.nit,
        contact_name=s.contact_name,
        phone=s.phone,
        email=s.email,
        address=s.address,
    )


@router.get("", response_model=list[SupplierResponse])
def list_suppliers(db: Session = Depends(get_db)):
    suppliers = (
        db.query(Supplier)
        .filter(
            Supplier.business_id == DEV_BUSINESS_ID,
            Supplier.deleted_at.is_(None),
        )
        .order_by(Supplier.name)
        .all()
    )
    return [_to_resp(s) for s in suppliers]


@router.post("", response_model=SupplierResponse, status_code=201)
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "El nombre no puede estar vacío")
    existing = db.query(Supplier).filter(
        Supplier.business_id == DEV_BUSINESS_ID,
        Supplier.name.ilike(name),
        Supplier.deleted_at.is_(None),
    ).first()
    if existing:
        raise HTTPException(400, f"Ya existe un proveedor llamado '{name}'")
    s = Supplier(
        business_id=DEV_BUSINESS_ID,
        name=name,
        nit=data.nit or None,
        contact_name=data.contact_name or None,
        phone=data.phone or None,
        email=data.email or None,
        address=data.address or None,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _to_resp(s)


@router.patch("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(supplier_id: str, data: SupplierUpdate, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(
        Supplier.id == supplier_id,
        Supplier.business_id == DEV_BUSINESS_ID,
        Supplier.deleted_at.is_(None),
    ).first()
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(400, "El nombre no puede estar vacío")
        s.name = name
    if data.nit          is not None: s.nit          = data.nit          or None
    if data.contact_name is not None: s.contact_name = data.contact_name or None
    if data.phone        is not None: s.phone        = data.phone        or None
    if data.email        is not None: s.email        = data.email        or None
    if data.address      is not None: s.address      = data.address      or None
    db.commit()
    db.refresh(s)
    return _to_resp(s)


@router.delete("/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: str, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(
        Supplier.id == supplier_id,
        Supplier.business_id == DEV_BUSINESS_ID,
        Supplier.deleted_at.is_(None),
    ).first()
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    s.deleted_at = datetime.now(timezone.utc)
    db.commit()
