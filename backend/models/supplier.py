from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.base import uuid7str

from database import Base
from models.base import SQLiteDecimal, TimestampMixin, SoftDeleteMixin


class Supplier(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "suppliers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    nit: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)

    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(
        "PurchaseOrder", back_populates="supplier"
    )


class PurchaseOrder(Base, TimestampMixin):
    """Orden de compra a proveedor."""
    __tablename__ = "purchase_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    supplier_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("suppliers.id"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)  # quien la creó
    # draft | sent | partial | received | cancelled
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    total: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    supplier: Mapped["Supplier"] = relationship("Supplier", back_populates="purchase_orders")
    items: Mapped[list["PurchaseItem"]] = relationship("PurchaseItem", back_populates="order")


class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    purchase_order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("purchase_orders.id"), nullable=False, index=True
    )
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id"), nullable=False
    )
    quantity_ordered: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    quantity_received: Mapped[object] = mapped_column(SQLiteDecimal, default="0")
    unit_cost: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    total_cost: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # batch creado al recibir

    order: Mapped["PurchaseOrder"] = relationship("PurchaseOrder", back_populates="items")
