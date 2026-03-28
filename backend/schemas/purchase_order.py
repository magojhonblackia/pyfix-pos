from pydantic import BaseModel


class POItemCreate(BaseModel):
    product_id: str
    quantity_ordered: float
    unit_cost: float


class POCreate(BaseModel):
    supplier_id: str
    notes: str | None = None
    items: list[POItemCreate]


class POItemResponse(BaseModel):
    id: str
    product_id: str
    product_name: str
    quantity_ordered: float
    quantity_received: float
    unit_cost: float
    total_cost: float


class POResponse(BaseModel):
    id: str
    supplier_id: str
    supplier_name: str
    status: str
    total: float
    notes: str | None
    received_at: str | None
    created_at: str
    items: list[POItemResponse]
