from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from models.base import uuid7str

from database import Base


class OutboxEvent(Base):
    """
    Outbox pattern — cada mutacion local genera un evento aqui DENTRO de la misma transaccion.
    El sync engine consume los eventos pendientes y los replica a PostgreSQL en la nube.
    """
    __tablename__ = "outbox_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # sale | stock_movement | invoice | customer | product
    aggregate_type: Mapped[str] = mapped_column(String(50), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(36), nullable=False)
    # created | updated | voided | synced
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)              # JSON snapshot completo
    # pending | synced | conflict | failed
    sync_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sync_version: Mapped[int] = mapped_column(Integer, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
