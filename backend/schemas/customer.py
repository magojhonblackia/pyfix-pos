from pydantic import BaseModel
from datetime import datetime


class CustomerCreate(BaseModel):
    name: str
    document_type: str | None = None   # CC | NIT | CE | PPN
    document_number: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = None
    document_type: str | None = None
    document_number: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None


class CustomerResponse(BaseModel):
    id: str
    name: str
    document_type: str | None
    document_number: str | None
    phone: str | None
    email: str | None
    address: str | None


class CustomerPurchaseItem(BaseModel):
    id: str
    total: float
    items_count: int
    payment_method: str
    status: str
    notes: str | None
    created_at: datetime
