from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.base import uuid7str

from database import Base
from models.base import SQLiteDecimal, TimestampMixin, SoftDeleteMixin


class Customer(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # CC | NIT | CE | PPN | NIT_EXT | NUIP
    document_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    document_number: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)

    loyalty: Mapped["LoyaltyAccount | None"] = relationship(
        "LoyaltyAccount", back_populates="customer", uselist=False
    )


class LoyaltyAccount(Base, TimestampMixin):
    __tablename__ = "loyalty_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    customer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("customers.id"), nullable=False, unique=True
    )
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    points_balance: Mapped[object] = mapped_column(SQLiteDecimal, default="0", nullable=False)
    total_earned: Mapped[object] = mapped_column(SQLiteDecimal, default="0", nullable=False)
    total_redeemed: Mapped[object] = mapped_column(SQLiteDecimal, default="0", nullable=False)
    # bronze | silver | gold | platinum
    tier: Mapped[str] = mapped_column(String(20), default="bronze", nullable=False)

    customer: Mapped["Customer"] = relationship("Customer", back_populates="loyalty")
