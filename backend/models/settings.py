from sqlalchemy import String, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from models.base import TimestampMixin


class BusinessSettings(Base, TimestampMixin):
    """Configuración del negocio — una fila por business_id."""
    __tablename__ = "business_settings"

    business_id:       Mapped[str] = mapped_column(String(36), primary_key=True)
    business_name:     Mapped[str] = mapped_column(String(200), default="Minimarket",   nullable=False)
    nit:               Mapped[str] = mapped_column(String(50),  default="000000000-0",  nullable=False)
    address:           Mapped[str] = mapped_column(String(300), default="",             nullable=False)
    phone:             Mapped[str] = mapped_column(String(50),  default="",             nullable=False)
    receipt_footer:    Mapped[str] = mapped_column(Text,        default="¡Gracias por su compra!", nullable=False)
    min_stock_threshold: Mapped[int] = mapped_column(Integer,   default=5,             nullable=False)
