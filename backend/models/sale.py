from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.base import uuid7str

from database import Base
from models.base import SQLiteDecimal, TimestampMixin, SoftDeleteMixin, SyncMixin


class Sale(Base, TimestampMixin, SoftDeleteMixin, SyncMixin):
    __tablename__ = "sales"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    branch_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    terminal_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    cash_register_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # completed | voided | partial_void
    status: Mapped[str] = mapped_column(String(20), default="completed", nullable=False)
    subtotal: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    discount_total: Mapped[object] = mapped_column(SQLiteDecimal, default="0")
    tax_total: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    total: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    cash_tendered: Mapped[object] = mapped_column(SQLiteDecimal, default="0")
    change_given: Mapped[object] = mapped_column(SQLiteDecimal, default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(36), nullable=True, unique=True)

    items: Mapped[list["SaleItem"]] = relationship("SaleItem", back_populates="sale", lazy="joined")
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="sale", lazy="joined")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    sale_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sales.id"), nullable=False, index=True
    )
    business_id: Mapped[str] = mapped_column(String(36), nullable=False)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)   # snapshot en venta
    barcode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    quantity: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    unit_price: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    cost_price: Mapped[object | None] = mapped_column(SQLiteDecimal, nullable=True)  # costo FIFO
    discount_pct: Mapped[object] = mapped_column(SQLiteDecimal, default="0")
    discount_amount: Mapped[object] = mapped_column(SQLiteDecimal, default="0")
    tax_rate: Mapped[str] = mapped_column(String(20), nullable=False)
    tax_amount: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    subtotal: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)  # (price * qty) - discount
    total: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)     # subtotal + tax
    weight_grams: Mapped[object | None] = mapped_column(SQLiteDecimal, nullable=True)
    batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # batch FIFO usado
    voided: Mapped[int] = mapped_column(Integer, default=0)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    void_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sale: Mapped["Sale"] = relationship("Sale", back_populates="items")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    sale_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sales.id"), nullable=False, index=True
    )
    business_id: Mapped[str] = mapped_column(String(36), nullable=False)
    # cash | wompi_card | daviplata | nequi | pse | loyalty_points | credit
    method: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # approved | pending | rejected | refunded
    status: Mapped[str] = mapped_column(String(20), default="approved", nullable=False)
    wompi_token: Mapped[str | None] = mapped_column(String(256), nullable=True)  # NUNCA PAN/CVV
    metadata_json: Mapped[str] = mapped_column(Text, default="{}", name="metadata")  # JSON
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    sale: Mapped["Sale"] = relationship("Sale", back_populates="payments")


class CashRegister(Base):
    """Turno de caja — apertura y cierre con cuadre."""
    __tablename__ = "cash_registers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    terminal_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # open | closed
    status: Mapped[str] = mapped_column(String(10), default="open", nullable=False)
    opening_amount: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    closing_amount: Mapped[object | None] = mapped_column(SQLiteDecimal, nullable=True)
    expected_amount: Mapped[object | None] = mapped_column(SQLiteDecimal, nullable=True)
    variance: Mapped[object | None] = mapped_column(SQLiteDecimal, nullable=True)  # faltante/sobrante
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    z_report_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
