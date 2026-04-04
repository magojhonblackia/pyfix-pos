from datetime import datetime
from pydantic import BaseModel, Field


class VoidRequest(BaseModel):
    reason:          str = "Error de operación"
    admin_username:  str
    admin_password:  str


class SaleItemIn(BaseModel):
    product_id: str
    quantity:   float = Field(gt=0)   # positivo; float para soportar productos por peso
    unit_price: float | None = None   # override del precio (p. ej. descuento por ítem)


class SplitPaymentInput(BaseModel):
    """Un único tramo de pago en una venta dividida."""
    method: str    # cash | card | nequi | daviplata
    amount: float  # monto cubierto por este método


class SaleCreate(BaseModel):
    items: list[SaleItemIn]
    # ── Pago simple (legacy) ──────────────────────────────────
    payment_method: str         = "cash"
    cash_tendered:  float | None = None
    # ── Pago dividido (nuevo) — si se provee, reemplaza payment_method ──
    split_payments: list[SplitPaymentInput] | None = None
    # ── Otros ────────────────────────────────────────────────
    discount_pct:     float      = 0.0
    notes:            str | None = None
    customer_id:      str | None = None
    idempotency_key:  str | None = None   # UUID generado por el frontend para prevenir duplicados


class SaleItemResponse(BaseModel):
    id: str
    product_id: str
    product_name: str
    quantity: float
    unit_price: float
    subtotal: float

    @classmethod
    def from_orm(cls, item) -> "SaleItemResponse":
        return cls(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product_name,
            quantity=float(item.quantity),
            unit_price=float(item.unit_price),
            subtotal=float(item.subtotal),
        )


class PaymentDetail(BaseModel):
    method: str
    amount: float


class SaleResponse(BaseModel):
    id: str
    total: float
    subtotal: float
    discount_total: float
    discount_pct: float
    cash_tendered: float
    change_given: float
    payment_method: str                  # método principal (primer pago)
    payments: list[PaymentDetail] = []  # todos los tramos de pago
    items_count: int
    status: str
    notes: str | None
    customer_id:   str | None = None
    customer_name: str | None = None
    created_at: datetime
    items: list[SaleItemResponse] = []

    @classmethod
    def from_orm(cls, sale, payment_method: str = "cash", customer_name: str | None = None) -> "SaleResponse":
        method = payment_method
        if sale.payments:
            method = sale.payments[0].method
        subtotal        = float(sale.subtotal)
        discount_total  = float(sale.discount_total or 0)
        discount_pct    = (discount_total / subtotal * 100) if subtotal > 0 else 0.0
        payments        = [PaymentDetail(method=p.method, amount=float(p.amount)) for p in sale.payments]
        return cls(
            id=sale.id,
            total=float(sale.total),
            subtotal=subtotal,
            discount_total=discount_total,
            discount_pct=round(discount_pct, 2),
            cash_tendered=float(sale.cash_tendered or 0),
            change_given=float(sale.change_given or 0),
            payment_method=method,
            payments=payments,
            items_count=sum(int(float(i.quantity)) for i in sale.items),
            status=sale.status,
            notes=sale.notes,
            customer_id=sale.customer_id,
            customer_name=customer_name,
            created_at=sale.created_at,
            items=[SaleItemResponse.from_orm(i) for i in sale.items],
        )
