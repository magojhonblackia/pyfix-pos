"""
🧪 PYFIX THE BREAKER — Test Suite: Autenticación y Autorización
Cubre: login, JWT, /me, protección de rutas, RBAC, casos de ruptura.
"""
import pytest
from datetime import datetime, timezone, timedelta
from jose import jwt

from .conftest import DEV_BRANCH_ID


# ── helpers ───────────────────────────────────────────────────
def _make_token(payload: dict, secret: str = "pyfix-dev-secret-change-in-production-2024",
                algorithm: str = "HS256") -> str:
    return jwt.encode(payload, secret, algorithm=algorithm)


# ══════════════════════════════════════════════════════════════
# Login
# ══════════════════════════════════════════════════════════════

class TestLogin:

    def test_admin_login_success(self, client):
        """Login con credenciales válidas → 200 con token y datos del usuario."""
        r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["username"] == "admin"
        assert body["role"] == "admin"
        assert body["access_token"]  # no vacío

    def test_cashier_login_success(self, client):
        """Cajero puede iniciar sesión correctamente."""
        r = client.post("/api/auth/login", json={"username": "cajero", "password": "cajero123"})
        assert r.status_code == 200
        assert r.json()["role"] == "cashier"

    def test_wrong_password_rejected(self, client):
        """Contraseña incorrecta → 401."""
        r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    def test_wrong_username_rejected(self, client):
        """Usuario inexistente → 401."""
        r = client.post("/api/auth/login", json={"username": "noexiste", "password": "admin123"})
        assert r.status_code == 401

    def test_empty_password_rejected(self, client):
        """Contraseña vacía → rechazado (401 o 422)."""
        r = client.post("/api/auth/login", json={"username": "admin", "password": ""})
        assert r.status_code in [401, 422]

    def test_missing_fields_rejected(self, client):
        """Body sin campos → 422."""
        r = client.post("/api/auth/login", json={})
        assert r.status_code == 422

    def test_token_contains_expected_claims(self, client):
        """El JWT contiene sub, role y exp."""
        r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        token = r.json()["access_token"]
        # Decodificar sin verificar firma para inspeccionar claims
        payload = jwt.decode(
            token,
            "pyfix-dev-secret-change-in-production-2024",
            algorithms=["HS256"],
        )
        assert "sub" in payload
        assert payload["role"] == "admin"
        assert "exp" in payload


# ══════════════════════════════════════════════════════════════
# /auth/me
# ══════════════════════════════════════════════════════════════

class TestMe:

    def test_me_returns_user_data(self, client, admin_headers):
        """GET /auth/me con token válido → datos del usuario."""
        r = client.get("/api/auth/me", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["username"] == "admin"
        assert body["role"] == "admin"

    def test_me_without_token_rejected(self, client):
        """GET /auth/me sin token → 401."""
        r = client.get("/api/auth/me")
        assert r.status_code == 401

    def test_me_with_malformed_token_rejected(self, client):
        """Token corrupto → 401."""
        r = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.valid.jwt"})
        assert r.status_code == 401

    def test_me_with_wrong_signature_rejected(self, client):
        """Token firmado con clave distinta → 401."""
        fake_token = _make_token(
            {"sub": "some-id", "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            secret="wrong-secret",
        )
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {fake_token}"})
        assert r.status_code == 401

    def test_me_with_expired_token_rejected(self, client):
        """Token expirado → 401."""
        expired_token = _make_token({
            "sub": "00000000-0000-7000-8000-000000000001",
            "role": "admin",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        })
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert r.status_code == 401

    def test_cashier_me_returns_cashier_role(self, client, cashier_headers):
        """Cajero también puede consultar su propio perfil."""
        r = client.get("/api/auth/me", headers=cashier_headers)
        assert r.status_code == 200
        assert r.json()["role"] == "cashier"


# ══════════════════════════════════════════════════════════════
# Protección de rutas (autenticación requerida)
# ══════════════════════════════════════════════════════════════

class TestProtectedEndpoints:

    def test_products_list_requires_auth(self, client):
        """GET /products sin token → 401."""
        r = client.get("/api/products")
        assert r.status_code == 401

    def test_sales_list_requires_auth(self, client):
        """GET /sales sin token → 401."""
        r = client.get("/api/sales")
        assert r.status_code == 401

    def test_users_list_requires_auth(self, client):
        """GET /users sin token → 401."""
        r = client.get("/api/users")
        assert r.status_code == 401

    def test_inventory_batches_requires_auth(self, client):
        """GET /inventory/batches sin token → 401."""
        r = client.get("/api/inventory/batches")
        assert r.status_code == 401

    def test_bearer_prefix_required(self, client, admin_headers):
        """Token sin prefijo 'Bearer' → no autenticado."""
        token = admin_headers["Authorization"].split(" ")[1]
        r = client.get("/api/auth/me", headers={"Authorization": token})
        assert r.status_code == 401


# ══════════════════════════════════════════════════════════════
# RBAC — Role-Based Access Control
# ══════════════════════════════════════════════════════════════

class TestRBAC:

    def test_cashier_cannot_list_users(self, client, cashier_headers):
        """Cajero intenta GET /users → 403 Forbidden."""
        r = client.get("/api/users", headers=cashier_headers)
        assert r.status_code == 403

    def test_cashier_cannot_create_user(self, client, cashier_headers):
        """Cajero no puede crear usuarios → 403."""
        r = client.post("/api/users", json={
            "username": "nuevo",
            "password": "pass123",
            "full_name": "Nuevo Usuario",
            "role": "cashier",
        }, headers=cashier_headers)
        assert r.status_code == 403

    def test_cashier_cannot_adjust_stock(self, client, db_session, cashier_headers):
        """Cajero no puede ajustar stock manualmente → 403."""
        from .conftest import make_product
        make_product(db_session, stock=10)
        r = client.patch("/api/products/prod-test-001/stock", json={
            "delta": 5,
            "reason": "adjustment",
        }, headers=cashier_headers)
        assert r.status_code == 403

    def test_admin_can_list_users(self, client, admin_headers):
        """Admin puede listar usuarios → 200."""
        r = client.get("/api/users", headers=admin_headers)
        assert r.status_code == 200

    def test_cashier_can_create_sale(self, client, db_session, cashier_headers):
        """Cajero SÍ puede crear ventas."""
        from .conftest import make_product
        make_product(db_session, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 5000,
        }, headers=cashier_headers)
        # 201 = OK; 404 si el router no arranca — lo que importa es no 401/403
        assert r.status_code not in [401, 403], \
            f"Cajero no debería tener prohibido crear ventas: {r.status_code}"

    def test_token_role_not_elevatable(self, client):
        """Un token con role=cashier no puede operar como admin aunque modifique el payload."""
        # Crear token manualmente con role=admin pero sin firma correcta
        fake_admin_token = _make_token(
            {
                "sub": "00000000-0000-7000-8000-000000000005",  # ID del cajero
                "role": "admin",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            secret="wrong-secret",
        )
        r = client.get("/api/users", headers={"Authorization": f"Bearer {fake_admin_token}"})
        assert r.status_code == 401, "Token con firma inválida no debe otorgar acceso"


# ══════════════════════════════════════════════════════════════
# 💣 MODO BREAK TEST — Auth
# ══════════════════════════════════════════════════════════════

class TestAuthBreaking:

    def test_sql_injection_in_username(self, client):
        """Payload de inyección en username → no crashea."""
        r = client.post("/api/auth/login", json={
            "username": "' OR '1'='1",
            "password": "nada",
        })
        assert r.status_code in [401, 422], \
            f"Posible inyección SQL en login: {r.status_code}"

    def test_extremely_long_password(self, client):
        """Contraseña >72 chars → 422 (rechazada por schema antes de llegar a bcrypt)."""
        r = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "A" * 500,
        })
        assert r.status_code == 422, \
            f"Contraseña larga debería ser rechazada con 422, got {r.status_code}"

    def test_none_token_field(self, client):
        """Header Authorization con valor 'Bearer None' → 401, no 500."""
        r = client.get("/api/auth/me", headers={"Authorization": "Bearer None"})
        assert r.status_code == 401

    def test_token_without_sub_claim(self, client):
        """JWT sin claim 'sub' → 401."""
        token = _make_token({
            "role": "admin",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        })
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

    def test_token_with_nonexistent_user_id(self, client):
        """JWT con sub=UUID que no existe en DB → 401."""
        token = _make_token({
            "sub": "00000000-dead-beef-0000-000000000000",
            "role": "admin",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        })
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401
