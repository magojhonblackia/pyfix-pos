from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.base import uuid7str

from database import Base
from models.base import SQLiteDecimal, TimestampMixin, SoftDeleteMixin, SyncMixin


class Category(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("categories.id"), nullable=True
    )

    parent: Mapped["Category | None"] = relationship("Category", remote_side="Category.id")
    products: Mapped[list["Product"]] = relationship("Product", back_populates="category")


class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    code: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)   # UND, KG, LT, G
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    allows_decimals: Mapped[int] = mapped_column(Integer, default=0)

    products: Mapped[list["Product"]] = relationship("Product", back_populates="unit")


class Product(Base, TimestampMixin, SoftDeleteMixin, SyncMixin):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    category_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("categories.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    sku: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    price: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    cost: Mapped[object | None] = mapped_column(SQLiteDecimal, nullable=True)
    price_per_kg: Mapped[object | None] = mapped_column(SQLiteDecimal, nullable=True)
    sold_by_weight: Mapped[int] = mapped_column(Integer, default=0)
    unit_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("units_of_measure.id"), nullable=True
    )
    # IVA_0 | IVA_5 | IVA_19 | INC_8 | EXCLUDED
    tax_rate: Mapped[str] = mapped_column(String(20), default="IVA_0", nullable=False)
    min_stock: Mapped[object] = mapped_column(SQLiteDecimal, default="0")
    max_stock: Mapped[object | None] = mapped_column(SQLiteDecimal, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[int] = mapped_column(Integer, default=1)

    category: Mapped["Category | None"] = relationship("Category", back_populates="products")
    unit: Mapped["UnitOfMeasure | None"] = relationship("UnitOfMeasure", back_populates="products")
    price_history: Mapped[list["PriceHistory"]] = relationship("PriceHistory", back_populates="product")
    inventory: Mapped[list["Inventory"]] = relationship("Inventory", back_populates="product")
    batches: Mapped[list["Batch"]] = relationship("Batch", back_populates="product")


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id"), nullable=False, index=True
    )
    business_id: Mapped[str] = mapped_column(String(36), nullable=False)
    old_price: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    new_price: Mapped[object] = mapped_column(SQLiteDecimal, nullable=False)
    changed_by: Mapped[str] = mapped_column(String(36), nullable=False)   # user_id
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    product: Mapped["Product"] = relationship("Product", back_populates="price_history")


# SQL para FTS5 — se ejecuta en startup de main.py
PRODUCTS_FTS_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
    name,
    description,
    content='products',
    content_rowid='rowid'
);
"""
