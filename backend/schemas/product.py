from datetime import datetime
from pydantic import BaseModel


# ── Categorías ────────────────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str

class CategoryUpdate(BaseModel):
    name: str | None = None

class CategoryResponse(BaseModel):
    id: str
    name: str
    product_count: int = 0


# ── Productos ─────────────────────────────────────────────────
class ProductCreate(BaseModel):
    name: str
    price: float
    cost_price: float = 0.0
    barcode: str | None = None
    stock: int = 0
    min_stock: int = 0               # umbral alerta bajo stock
    category_id: str | None = None   # UUID de categoría (opcional)


class ProductImportItem(BaseModel):
    name: str
    price: float
    cost_price: float = 0.0
    barcode: str | None = None
    category_name: str | None = None
    stock: float = 0.0
    min_stock: float = 0.0


class ProductImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[str]


class BulkPriceUpdateRequest(BaseModel):
    pct_change:  float                # +10 = subir 10 %, -5 = bajar 5 %
    field:       str  = "price"       # "price" | "cost_price" | "both"
    category_id: str | None = None   # None → todos los productos activos
    round_to:    int  = 0            # 0 = sin redondeo | 100 | 500 | 1000 pesos


class BulkPriceUpdateResult(BaseModel):
    updated: int
    skipped: int


class StockAdjustRequest(BaseModel):
    delta: float          # positivo = entrada, negativo = salida/merma
    reason: str = "adjustment"   # adjustment | purchase | damage | theft | count_correction
    notes: str | None = None     # texto libre: proveedor, factura, observación, etc.
    # Campos para crear lote (solo cuando reason == "purchase" y delta > 0)
    lot_number: str | None = None
    expires_at: str | None = None   # ISO date YYYY-MM-DD
    cost_per_unit: float | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    price: float | None = None
    cost_price: float | None = None
    barcode: str | None = None
    stock: int | None = None
    min_stock: int | None = None
    is_active: bool | None = None
    category_id: str | None = None


class ProductResponse(BaseModel):
    id: str
    name: str
    price: float
    cost_price: float
    barcode: str | None
    stock: int
    min_stock: int
    is_active: bool
    category_id: str | None
    category_name: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_product(cls, product, stock: int = 0) -> "ProductResponse":
        return cls(
            id=product.id,
            name=product.name,
            price=float(product.price or 0),
            cost_price=float(product.cost or 0),
            barcode=product.barcode,
            stock=int(stock or 0),
            min_stock=int(float(product.min_stock or 0)),
            is_active=bool(product.is_active),
            category_id=product.category_id,
            category_name=product.category.name if product.category else None,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )
