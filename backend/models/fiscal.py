from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.base import uuid7str

from database import Base


class FiscalInvoice(Base):
    """
    Factura electrónica DIAN.
    Una por venta. Puede ser electrónica, POS ticket o contingencia.
    """
    __tablename__ = "fiscal_invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    sale_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("sales.id"), nullable=True, unique=True
    )
    # electronic_invoice | pos_ticket | contingency | credit_note | debit_note
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    number: Mapped[str] = mapped_column(String(30), nullable=False)        # consecutivo según resolución DIAN
    resolution_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    cufe: Mapped[str | None] = mapped_column(String(96), nullable=True, unique=True)  # Código Único Factura
    xml_content: Mapped[str | None] = mapped_column(Text, nullable=True)   # XML firmado
    qr_code: Mapped[str | None] = mapped_column(Text, nullable=True)       # URL QR DIAN
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # pending | accepted | rejected | contingency
    dian_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    dian_response: Mapped[str] = mapped_column(Text, default="{}")          # JSON respuesta DIAN
    is_contingency: Mapped[int] = mapped_column(Integer, default=0)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    sale: Mapped["Sale | None"] = relationship("Sale")


class ContingencyRange(Base):
    """
    Rango de numeración para facturas de contingencia (cuando DIAN no responde).
    """
    __tablename__ = "contingency_ranges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid7str)
    business_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    start_number: Mapped[int] = mapped_column(Integer, nullable=False)
    end_number: Mapped[int] = mapped_column(Integer, nullable=False)
    current_number: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[int] = mapped_column(Integer, default=0)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
