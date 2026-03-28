from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from models.base import uuid7str

from database import Base


class AuditLog(Base):
    """
    Registro de auditoría — APPEND-ONLY.
    Los triggers de SQLite (creados en startup) impiden UPDATE y DELETE.
    """
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_name: Mapped[str] = mapped_column(String(200), nullable=False)    # snapshot, sin FK
    terminal_id: Mapped[str] = mapped_column(String(36), nullable=False)
    hardware_id: Mapped[str] = mapped_column(String(128), nullable=False)
    # sale.void_item | drawer.open | price.change | stock.adjust | auth.login | etc.
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    previous_state: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON
    new_state: Mapped[str | None] = mapped_column(Text, nullable=True)         # JSON
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    hash_prev: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 del registro anterior
    hash_self: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 de este registro


# Lista de statements — cada trigger es una cadena separada (no dividir por ;)
AUDIT_TRIGGERS_SQL = [
    "CREATE TRIGGER IF NOT EXISTS audit_no_update "
    "BEFORE UPDATE ON audit_logs "
    "BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END",

    "CREATE TRIGGER IF NOT EXISTS audit_no_delete "
    "BEFORE DELETE ON audit_logs "
    "BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END",
]
