import time
import random
from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy import TypeDecorator, Text, Numeric, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column


def uuid7str() -> str:
    """UUID v7: time-sortable, offline-safe. Sin dependencias externas."""
    unix_ts_ms = int(time.time() * 1000)
    rand_a = random.getrandbits(12)
    rand_b = random.getrandbits(62)
    value = (unix_ts_ms << 80) | (0x7 << 76) | (rand_a << 64) | (0b10 << 62) | rand_b
    h = f"{value:032x}"
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


class SQLiteDecimal(TypeDecorator):
    """Almacena Decimal como TEXT en SQLite, como NUMERIC(18,4) en PostgreSQL."""
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "sqlite":
            return dialect.type_descriptor(Text())
        return dialect.type_descriptor(Numeric(18, 4))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return Decimal(str(value))


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )


class SyncMixin:
    is_synced: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sync_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
