from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.base import uuid7str

from database import Base
from models.base import TimestampMixin, SoftDeleteMixin


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("business_id", "username", name="uq_user_business_username"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("businesses.id"), nullable=False, index=True
    )
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # cashier | supervisor | warehouse | accountant | admin
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    permissions: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON array
    pin: Mapped[str | None] = mapped_column(String(256), nullable=True)           # hash del PIN
    is_active: Mapped[int] = mapped_column(Integer, default=1)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    business: Mapped["Business"] = relationship("Business", back_populates="users")
    sessions: Mapped[list["UserSession"]] = relationship("UserSession", back_populates="user")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    terminal_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    hardware_id: Mapped[str] = mapped_column(String(128), nullable=False)
    token_jti: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)   # JWT ID access
    refresh_jti: Mapped[str] = mapped_column(String(36), nullable=False, unique=True) # JWT ID refresh
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="sessions")
