# Nivel 1 — base (sin dependencias internas)
from .base import SQLiteDecimal, TimestampMixin, SoftDeleteMixin, SyncMixin  # noqa: F401

# Nivel 2 — modelos de dominio (orden importa: respeta FK entre tablas)
from .business import Business, Branch, Terminal                              # noqa: F401
from .user import User, UserSession                                          # noqa: F401
from .audit import AuditLog                                                  # noqa: F401
from .outbox import OutboxEvent                                              # noqa: F401
from .product import Category, UnitOfMeasure, Product, PriceHistory         # noqa: F401
from .inventory import Inventory, Batch, StockMovement, ExpiryAlert         # noqa: F401
from .customer import Customer, LoyaltyAccount                               # noqa: F401
from .supplier import Supplier, PurchaseOrder, PurchaseItem                  # noqa: F401
from .sale import Sale, SaleItem, Payment, CashRegister                     # noqa: F401
from .fiscal import FiscalInvoice, ContingencyRange                          # noqa: F401
from .petty_cash import PettyCashExpense                                     # noqa: F401
from .settings import BusinessSettings                                       # noqa: F401
from .sync_snapshot import SyncSnapshot                                      # noqa: F401

__all__ = [
    # base
    "SQLiteDecimal", "TimestampMixin", "SoftDeleteMixin", "SyncMixin",
    # business
    "Business", "Branch", "Terminal",
    # users
    "User", "UserSession",
    # audit / outbox
    "AuditLog", "OutboxEvent",
    # products
    "Category", "UnitOfMeasure", "Product", "PriceHistory",
    # inventory
    "Inventory", "Batch", "StockMovement", "ExpiryAlert",
    # customers
    "Customer", "LoyaltyAccount",
    # suppliers
    "Supplier", "PurchaseOrder", "PurchaseItem",
    # sales
    "Sale", "SaleItem", "Payment", "CashRegister",
    # fiscal
    "FiscalInvoice", "ContingencyRange",
    # petty cash
    "PettyCashExpense",
    # settings
    "BusinessSettings",
    # sync
    "SyncSnapshot",
]
