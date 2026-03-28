from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from models.base import uuid7str

from database import Base
from models.base import SQLiteDecimal


class PettyCashExpense(Base):
    """Gastos de caja menor registrados durante un turno."""
    __tablename__ = "petty_cash_expenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    cash_register_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cash_registers.id"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    amount: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    # supplies | cleaning | transport | food | maintenance | other
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    receipt_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
