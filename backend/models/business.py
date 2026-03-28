from sqlalchemy import String, Integer, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.base import uuid7str

from database import Base
from models.base import TimestampMixin, SoftDeleteMixin, SyncMixin


class Business(Base, TimestampMixin, SoftDeleteMixin, SyncMixin):
    __tablename__ = "businesses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    nit: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    dian_resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    fiscal_regime: Mapped[str] = mapped_column(String(20), default="simple")  # simple | ordinario
    plan: Mapped[str] = mapped_column(String(20), default="free")
    features: Mapped[str] = mapped_column(Text, default="{}")   # JSON
    config: Mapped[str] = mapped_column(Text, default="{}")     # JSON

    branches: Mapped[list["Branch"]] = relationship("Branch", back_populates="business")
    users: Mapped[list["User"]] = relationship("User", back_populates="business")


class Branch(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "branches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("businesses.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_main: Mapped[int] = mapped_column(Integer, default=0)

    business: Mapped["Business"] = relationship("Business", back_populates="branches")
    terminals: Mapped[list["Terminal"]] = relationship("Terminal", back_populates="branch")


class Terminal(Base, TimestampMixin):
    __tablename__ = "terminals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    branch_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("branches.id"), nullable=False, index=True
    )
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)  # desnormalizado
    hardware_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    printer_config: Mapped[str] = mapped_column(Text, default="{}")  # JSON
    scale_config: Mapped[str] = mapped_column(Text, default="{}")    # JSON
    is_active: Mapped[int] = mapped_column(Integer, default=1)

    branch: Mapped["Branch"] = relationship("Branch", back_populates="terminals")
