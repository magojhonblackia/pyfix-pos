from datetime import datetime
from pydantic import BaseModel


class OpenRegisterRequest(BaseModel):
    opening_amount: float


class CloseRegisterRequest(BaseModel):
    closing_amount: float


# ── Caja menor ────────────────────────────────────────────────
class PettyCashExpenseCreate(BaseModel):
    amount: float
    # supplies | cleaning | transport | food | maintenance | other
    category: str = "other"
    description: str


class PettyCashExpenseResponse(BaseModel):
    id: str
    amount: float
    category: str
    description: str
    created_at: datetime


# ── Turno ─────────────────────────────────────────────────────
class CashRegisterResponse(BaseModel):
    id: str
    status: str                     # open | closed
    opening_amount: float
    closing_amount: float | None
    expected_amount: float | None
    variance: float | None
    opened_at: datetime
    closed_at: datetime | None
    # Calculados al vuelo por el router
    sales_count: int = 0
    sales_total: float = 0.0
    expenses_total: float = 0.0     # gastos de caja menor del turno

    @classmethod
    def from_orm(
        cls,
        reg,
        sales_count: int = 0,
        sales_total: float = 0.0,
        expenses_total: float = 0.0,
    ) -> "CashRegisterResponse":
        return cls(
            id=reg.id,
            status=reg.status,
            opening_amount=float(reg.opening_amount or 0),
            closing_amount=float(reg.closing_amount) if reg.closing_amount is not None else None,
            expected_amount=float(reg.expected_amount) if reg.expected_amount is not None else None,
            variance=float(reg.variance) if reg.variance is not None else None,
            opened_at=reg.opened_at,
            closed_at=reg.closed_at,
            sales_count=sales_count,
            sales_total=sales_total,
            expenses_total=expenses_total,
        )
