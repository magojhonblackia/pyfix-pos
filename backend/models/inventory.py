from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.base import uuid7str

from database import Base
from models.base import SQLiteDecimal, TimestampMixin


class Inventory(Base):
    """Stock actual por producto y sucursal."""
    __tablename__ = "inventory"
    __table_args__ = (UniqueConstraint("branch_id", "product_id", name="uq_inventory_branch_product"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    branch_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("branches.id"), nullable=False, index=True
    )
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id"), nullable=False, index=True
    )
    quantity: Mapped[object] = mapped_column(SQLiteDecimal, default="0", nullable=False)
    reserved: Mapped[object] = mapped_column(SQLiteDecimal, default="0", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    product: Mapped["Product"] = relationship("Product", back_populates="inventory")


class Batch(Base, TimestampMixin):
    """Lotes FIFO — cada ingreso de mercancía crea un batch."""
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id"), nullable=False, index=True
    )
    lot_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    quantity: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    remaining: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)  # decrece con cada venta FIFO
    cost_per_unit: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    supplier_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    purchase_order_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    product: Mapped["Product"] = relationship("Product", back_populates="batches")


class StockMovement(Base):
    """Registro de cada cambio de inventario (ventas, ajustes, ingresos, mermas)."""
    __tablename__ = "stock_movements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    branch_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id"), nullable=False, index=True
    )
    quantity_delta: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)  # negativo = salida
    quantity_before: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    quantity_after: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    # sale | purchase | adjustment | damage | expiry | theft | count_correction
    reason: Mapped[str] = mapped_column(String(30), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    batch_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("batches.id"), nullable=True
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    sale_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # FK lógica a sales
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )


class ExpiryAlert(Base):
    """Alertas de productos próximos a vencer."""
    __tablename__ = "expiry_alerts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id"), nullable=False, index=True
    )
    batch_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("batches.id"), nullable=False
    )
    business_id: Mapped[str] = mapped_column(String(36), nullable=False)
    days_until_expiry: Mapped[int] = mapped_column(Integer, nullable=False)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
