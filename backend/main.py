from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import config as _config  # noqa: F401 — garantiza que load_dotenv() se ejecuta primero
from sqlalchemy import text
from sqlalchemy.orm import Session

import bcrypt as _bcrypt

from database import engine, Base
from models import (  # noqa: F401 — registrar todos los modelos en Base.metadata
    Business, Branch, Terminal,
    User, UserSession,
    AuditLog, OutboxEvent,
    Category, UnitOfMeasure, Product, PriceHistory,
    Inventory, Batch, StockMovement, ExpiryAlert,
    Customer, LoyaltyAccount,
    Supplier, PurchaseOrder, PurchaseItem,
    Sale, SaleItem, Payment, CashRegister,
    FiscalInvoice, ContingencyRange,
    PettyCashExpense,
    BusinessSettings,
)
from models.audit import AUDIT_TRIGGERS_SQL
from models.product import PRODUCTS_FTS_SQL
from routers import products, sales, cash_register, suppliers, purchase_orders, customers
from routers import auth as auth_router, users as users_router, hardware as hardware_router, inventory as inventory_router
from routers import settings as settings_router
from constants import DEV_BUSINESS_ID, DEV_BRANCH_ID, DEV_CATEGORY_IDS, DEV_USER_ID

app = FastAPI(title="PYFIX POS API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router,     prefix="/api")
app.include_router(users_router.router,   prefix="/api")
app.include_router(products.router,       prefix="/api")
app.include_router(sales.router,          prefix="/api")
app.include_router(cash_register.router,  prefix="/api")
app.include_router(suppliers.router,       prefix="/api")
app.include_router(purchase_orders.router, prefix="/api")
app.include_router(customers.router,       prefix="/api")
app.include_router(hardware_router.router,   prefix="/api")
app.include_router(inventory_router.router, prefix="/api")
app.include_router(settings_router.router,  prefix="/api")


def _hash_pw(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()

_DEV_USERS = [
    {
        "id":        DEV_USER_ID,
        "username":  "admin",
        "password":  "admin123",
        "full_name": "Administrador",
        "role":      "admin",
    },
    {
        "id":        "00000000-0000-7000-8000-000000000005",
        "username":  "cajero",
        "password":  "cajero123",
        "full_name": "Cajero Demo",
        "role":      "cashier",
    },
]


def _create_dev_fixtures(db: Session) -> None:
    """Crea Business, Branch, categorías y usuarios por defecto para desarrollo."""
    if not db.get(Business, DEV_BUSINESS_ID):
        db.add(Business(
            id=DEV_BUSINESS_ID,
            name="Minimarket Dev",
            nit="000000000-0",
        ))
        db.add(Branch(
            id=DEV_BRANCH_ID,
            business_id=DEV_BUSINESS_ID,
            name="Sede Principal",
            is_main=1,
        ))
        db.commit()

    # Categorías predefinidas (idempotente)
    for cat_name, cat_id in DEV_CATEGORY_IDS.items():
        if not db.get(Category, cat_id):
            db.add(Category(
                id=cat_id,
                business_id=DEV_BUSINESS_ID,
                name=cat_name,
            ))

    # Usuarios de desarrollo (idempotente)
    for u in _DEV_USERS:
        if not db.get(User, u["id"]):
            db.add(User(
                id            = u["id"],
                business_id   = DEV_BUSINESS_ID,
                username      = u["username"],
                password_hash = _hash_pw(u["password"]),
                full_name     = u["full_name"],
                role          = u["role"],
                permissions   = "[]",
            ))

    db.commit()


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        for stmt in AUDIT_TRIGGERS_SQL:
            conn.execute(text(stmt))
        conn.execute(text(PRODUCTS_FTS_SQL))
        conn.commit()

    with Session(engine) as db:
        _create_dev_fixtures(db)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/health")
def health():
    return {"status": "ok", "service": "pyfix-pos", "version": "2.0.0"}
