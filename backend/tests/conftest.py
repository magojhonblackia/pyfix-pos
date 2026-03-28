"""
Fixtures compartidos para todos los tests de PYFIX POS.
Usa SQLite en memoria para aislamiento total entre tests.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import bcrypt as _bcrypt

from database import Base, get_db
from main import app, AUDIT_TRIGGERS_SQL, PRODUCTS_FTS_SQL
from constants import DEV_BUSINESS_ID, DEV_BRANCH_ID, DEV_TERMINAL_ID, DEV_USER_ID, DEV_CATEGORY_IDS
from models.business import Business, Branch
from models.user import User
from models.product import Category, Product
from models.inventory import Inventory

# ── Helpers ───────────────────────────────────────────────────
_CASHIER_ID = "00000000-0000-7000-8000-000000000005"


def _hash(pw: str) -> str:
    return _bcrypt.hashpw(pw.encode(), _bcrypt.gensalt()).decode()


def _seed(db):
    """Replica _create_dev_fixtures de main.py para tests."""
    db.add(Business(id=DEV_BUSINESS_ID, name="Test Store", nit="000000000-0"))
    db.add(Branch(id=DEV_BRANCH_ID, business_id=DEV_BUSINESS_ID, name="Principal", is_main=1))

    for name, cid in DEV_CATEGORY_IDS.items():
        db.add(Category(id=cid, business_id=DEV_BUSINESS_ID, name=name))

    db.add(User(
        id=DEV_USER_ID, business_id=DEV_BUSINESS_ID,
        username="admin", password_hash=_hash("admin123"),
        full_name="Admin Test", role="admin", permissions="[]",
    ))
    db.add(User(
        id=_CASHIER_ID, business_id=DEV_BUSINESS_ID,
        username="cajero", password_hash=_hash("cajero123"),
        full_name="Cajero Test", role="cashier", permissions="[]",
    ))
    db.commit()


# ── Fixtures ──────────────────────────────────────────────────
@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,   # una sola conexión compartida — necesario para SQLite in-memory
    )
    # WAL + FK
    with engine.connect() as conn:
        conn.execute(text("PRAGMA journal_mode=WAL"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()

    Base.metadata.create_all(engine)

    # Crear triggers y FTS (best-effort — pueden no funcionar en in-memory)
    with engine.connect() as conn:
        try:
            for stmt in AUDIT_TRIGGERS_SQL:
                conn.execute(text(stmt))
            conn.execute(text(PRODUCTS_FTS_SQL))
            conn.commit()
        except Exception:
            pass  # En tests los triggers son opcionales

    Session = sessionmaker(bind=engine, autoflush=False)
    db = Session()
    _seed(db)
    yield db
    db.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def client(db_session):
    def _override():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_headers(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, f"Login admin falló: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def cashier_headers(client):
    r = client.post("/api/auth/login", json={"username": "cajero", "password": "cajero123"})
    assert r.status_code == 200, f"Login cajero falló: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ── Helper para crear productos con stock ─────────────────────
def make_product(
    db,
    pid: str = "prod-test-001",
    name: str = "Producto Test",
    price: float = 5000,
    cost: float = 3000,
    stock: float = 10,
    category_id: str | None = None,
    barcode: str = "7700000000001",
) -> Product:
    cat_id = category_id or list(DEV_CATEGORY_IDS.values())[0]
    p = Product(
        id=pid,
        business_id=DEV_BUSINESS_ID,
        category_id=cat_id,
        name=name,
        price=Decimal(str(price)),
        cost=Decimal(str(cost)),
        barcode=barcode,
        is_active=1,
    )
    db.add(p)
    if stock > 0:
        db.add(Inventory(
            id=f"inv-{pid}",
            business_id=DEV_BUSINESS_ID,
            branch_id=DEV_BRANCH_ID,
            product_id=pid,
            quantity=Decimal(str(stock)),
        ))
    db.commit()
    return p
