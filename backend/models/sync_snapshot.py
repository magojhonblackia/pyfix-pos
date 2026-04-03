from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from models.base import uuid7str


class SyncSnapshot(Base):
    """
    Almacena el snapshot más reciente de datos de un negocio.

    En la nube (Railway / PostgreSQL):
      - Una fila por license_key con todos los datos del negocio.
      - Se reemplaza (upsert) en cada push.

    En local (SQLite):
      - license_key = "__sync_state__" → guarda las fechas de último push/pull.
    """
    __tablename__ = "sync_snapshots"

    id:          Mapped[str] = mapped_column(String(36),  primary_key=True, default=uuid7str)
    license_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    device_id:   Mapped[str] = mapped_column(String(100), nullable=False, default="local")
    # JSON completo con settings, products, sales, etc.
    payload:     Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # {"products": N, "sales": N, ...}
    stats:       Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at:  Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at:  Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
