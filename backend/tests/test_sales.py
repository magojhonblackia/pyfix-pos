"""
🧪 PYFIX THE BREAKER — Test Suite: Ventas (Sales)
Cubre: creación, descuentos, stock, anulación, pagos divididos, casos de ruptura.
"""
import pytest
from decimal import Decimal
from .conftest import make_product, DEV_BRANCH_ID
from models.inventory import Inventory
from models.sale import Sale


# ══════════════════════════════════════════════════════════════
# UNITARIOS — Lógica de negocio pura (sin red, solo cálculos)
# ══════════════════════════════════════════════════════════════

class TestSaleCalculations:
    """Matemáticas de ventas verificadas sin base de datos."""

    def test_total_without_discount(self, client, db_session, admin_headers):
        """Subtotal == Total cuando discount_pct == 0."""
        make_product(db_session, price=5000, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 2}],
            "payment_method": "cash",
            "cash_tendered": 10000,
        }, headers=admin_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["total"] == 10000
        assert data["subtotal"] == 10000
        assert data["discount_total"] == 0

    def test_discount_pct_reduces_total_correctly(self, client, db_session, admin_headers):
        """Descuento del 10% sobre $10.000 → total $9.000."""
        make_product(db_session, price=10000, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "discount_pct": 10,
            "cash_tendered": 10000,
        }, headers=admin_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["total"] == pytest.approx(9000, abs=1)
        assert data["discount_total"] == pytest.approx(1000, abs=1)

    def test_discount_capped_at_100_percent(self, client, db_session, admin_headers):
        """Descuento no puede superar 100% — total mínimo es 0."""
        make_product(db_session, price=5000, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "discount_pct": 150,   # inválido, debe capear a 100%
            "cash_tendered": 0,
        }, headers=admin_headers)
        assert r.status_code == 201
        assert r.json()["total"] == pytest.approx(0, abs=1)

    def test_change_calculated_correctly(self, client, db_session, admin_headers):
        """Vuelto = cash_tendered - total."""
        make_product(db_session, price=3000, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 5000,
        }, headers=admin_headers)
        assert r.status_code == 201
        assert r.json()["change_given"] == pytest.approx(2000, abs=1)

    def test_insufficient_cash_tendered_rejected(self, client, db_session, admin_headers):
        """Pago en efectivo insuficiente → 400."""
        make_product(db_session, price=10000, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 5000,
        }, headers=admin_headers)
        assert r.status_code == 400

    def test_unit_price_override_respected(self, client, db_session, admin_headers):
        """Frontend puede enviar unit_price diferente (descuento por ítem)."""
        make_product(db_session, price=10000, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1, "unit_price": 8000}],
            "payment_method": "cash",
            "cash_tendered": 8000,
        }, headers=admin_headers)
        assert r.status_code == 201
        assert r.json()["total"] == pytest.approx(8000, abs=1)


# ══════════════════════════════════════════════════════════════
# INTEGRACIÓN — Con DB real (in-memory)
# ══════════════════════════════════════════════════════════════

class TestSaleCreation:

    def test_create_sale_success(self, client, db_session, admin_headers):
        """Venta exitosa → status 201, campos correctos."""
        make_product(db_session, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 2}],
            "payment_method": "cash",
            "cash_tendered": 20000,
        }, headers=admin_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["status"] == "completed"
        assert data["total"] == pytest.approx(10000, abs=1)

    def test_sale_deducts_stock(self, client, db_session, admin_headers):
        """Venta exitosa → stock se descuenta exactamente."""
        make_product(db_session, stock=10)
        client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 3}],
            "payment_method": "cash",
            "cash_tendered": 20000,
        }, headers=admin_headers)

        inv = db_session.query(Inventory).filter(
            Inventory.product_id == "prod-test-001",
            Inventory.branch_id == DEV_BRANCH_ID,
        ).first()
        assert float(inv.quantity) == pytest.approx(7, abs=0.001)

    def test_empty_cart_rejected(self, client, admin_headers):
        """Venta sin ítems → 400."""
        r = client.post("/api/sales", json={
            "items": [],
            "payment_method": "cash",
        }, headers=admin_headers)
        assert r.status_code == 400

    def test_inactive_product_rejected(self, client, db_session, admin_headers):
        """Producto inactivo no puede venderse."""
        p = make_product(db_session, stock=5)
        p.is_active = 0
        db_session.commit()
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 5000,
        }, headers=admin_headers)
        assert r.status_code == 404

    def test_invalid_payment_method_rejected(self, client, db_session, admin_headers):
        """Método de pago inválido → 400."""
        make_product(db_session, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "bitcoin",
        }, headers=admin_headers)
        assert r.status_code == 400

    def test_non_cash_methods_dont_require_cash_tendered(self, client, db_session, admin_headers):
        """Nequi/tarjeta no requieren cash_tendered."""
        make_product(db_session, stock=5)
        for method in ["card", "nequi", "daviplata"]:
            r = client.post("/api/sales", json={
                "items": [{"product_id": "prod-test-001", "quantity": 1}],
                "payment_method": method,
            }, headers=admin_headers)
            assert r.status_code == 201, f"Método '{method}' falló: {r.text}"


# ══════════════════════════════════════════════════════════════
# STOCK — Límites y casos borde
# ══════════════════════════════════════════════════════════════

class TestStockValidation:

    def test_insufficient_stock_rejected(self, client, db_session, admin_headers):
        """Vender más del stock disponible → 400 con mensaje útil."""
        make_product(db_session, stock=3)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 5}],
            "payment_method": "cash",
            "cash_tendered": 50000,
        }, headers=admin_headers)
        assert r.status_code == 400
        assert "stock" in r.json()["detail"].lower()

    def test_last_unit_can_be_sold(self, client, db_session, admin_headers):
        """El último ítem en stock puede venderse (stock = 1, qty = 1)."""
        make_product(db_session, stock=1)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 5000,
        }, headers=admin_headers)
        assert r.status_code == 201
        inv = db_session.query(Inventory).filter_by(product_id="prod-test-001").first()
        assert float(inv.quantity) == pytest.approx(0, abs=0.001)

    def test_zero_stock_blocked(self, client, db_session, admin_headers):
        """Producto agotado → 400 aunque el producto existe."""
        make_product(db_session, stock=0)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 5000,
        }, headers=admin_headers)
        assert r.status_code == 400

    def test_fractional_stock_not_truncated(self, client, db_session, admin_headers):
        """Stock fraccionario funciona correctamente (BUG #1 corregido)."""
        make_product(db_session, stock=0.5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 0.4}],
            "payment_method": "cash",
            "cash_tendered": 2000,
        }, headers=admin_headers)
        assert r.status_code == 201, "Debería vender 0.4 kg con stock 0.5 kg"


# ══════════════════════════════════════════════════════════════
# ANULACIÓN DE VENTAS
# ══════════════════════════════════════════════════════════════

class TestVoidSale:

    def test_void_returns_stock(self, client, db_session, admin_headers):
        """Anular venta → stock se restaura exactamente."""
        make_product(db_session, stock=10)
        sale_r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 3}],
            "payment_method": "cash",
            "cash_tendered": 20000,
        }, headers=admin_headers)
        sale_id = sale_r.json()["id"]

        # Stock después de venta = 7
        inv = db_session.query(Inventory).filter_by(product_id="prod-test-001").first()
        db_session.refresh(inv)
        assert float(inv.quantity) == pytest.approx(7, abs=0.001)

        # Anular
        void_r = client.post(f"/api/sales/{sale_id}/void",
                              json={"reason": "Error del cajero"},
                              headers=admin_headers)
        assert void_r.status_code == 200
        assert void_r.json()["status"] == "voided"

        # Stock restaurado = 10
        db_session.refresh(inv)
        assert float(inv.quantity) == pytest.approx(10, abs=0.001)

    def test_void_already_voided_sale_returns_400(self, client, db_session, admin_headers):
        """Intentar anular una venta ya anulada → 400."""
        make_product(db_session, stock=5)
        sale_r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 10000,
        }, headers=admin_headers)
        sale_id = sale_r.json()["id"]

        client.post(f"/api/sales/{sale_id}/void",
                    json={"reason": "Primera anulación"},
                    headers=admin_headers)
        r = client.post(f"/api/sales/{sale_id}/void",
                        json={"reason": "Segunda anulación"},
                        headers=admin_headers)
        assert r.status_code == 400

    def test_void_nonexistent_sale_returns_404(self, client, admin_headers):
        """Anular ID inexistente → 404."""
        r = client.post("/api/sales/no-existe-id/void",
                        json={"reason": "Test"},
                        headers=admin_headers)
        assert r.status_code == 404

    def test_void_without_reason_uses_default(self, client, db_session, admin_headers):
        """Anulación sin razón → usa el valor por defecto del schema (no falla)."""
        make_product(db_session, stock=5)
        sale_r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 10000,
        }, headers=admin_headers)
        sale_id = sale_r.json()["id"]
        # VoidRequest.reason tiene default "Error de operación" → body vacío es válido
        r = client.post(f"/api/sales/{sale_id}/void", json={}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "voided"


# ══════════════════════════════════════════════════════════════
# PAGO DIVIDIDO (SPLIT)
# ══════════════════════════════════════════════════════════════

class TestSplitPayments:

    def test_split_payment_requires_min_2_methods(self, client, db_session, admin_headers):
        """Pago dividido con un solo método → 400."""
        make_product(db_session, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "split_payments": [{"method": "cash", "amount": 5000}],
        }, headers=admin_headers)
        assert r.status_code == 400

    def test_split_payment_sum_must_cover_total(self, client, db_session, admin_headers):
        """Suma de pagos divididos < total → 400."""
        make_product(db_session, price=10000, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "split_payments": [
                {"method": "cash", "amount": 3000},
                {"method": "nequi", "amount": 2000},  # Total: 5000 < 10000
            ],
        }, headers=admin_headers)
        assert r.status_code == 400

    def test_split_payment_success(self, client, db_session, admin_headers):
        """Pago dividido válido (efectivo + nequi) → 201."""
        make_product(db_session, price=10000, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "split_payments": [
                {"method": "cash", "amount": 5000},
                {"method": "nequi", "amount": 5000},
            ],
        }, headers=admin_headers)
        assert r.status_code == 201


# ══════════════════════════════════════════════════════════════
# 💣 MODO BREAK TEST — Casos que rompen el checkout
# ══════════════════════════════════════════════════════════════

class TestCheckoutBreaking:

    def test_double_click_creates_one_sale_only(self, client, db_session, admin_headers):
        """Doble clic con idempotency_key → solo una venta (BUG #2 corregido)."""
        import uuid
        make_product(db_session, stock=5)
        idem_key = str(uuid.uuid4())
        payload = {
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 5000,
            "idempotency_key": idem_key,
        }
        r1 = client.post("/api/sales", json=payload, headers=admin_headers)
        r2 = client.post("/api/sales", json=payload, headers=admin_headers)

        assert r1.status_code == 201
        # Segunda petición devuelve la misma venta (idempotente)
        assert r2.status_code in [200, 201]
        assert r1.json()["id"] == r2.json()["id"], "Ambas respuestas deben apuntar a la misma venta"

        # Stock descontado solo una vez → queda 4, no 3
        inv = db_session.query(Inventory).filter_by(product_id="prod-test-001").first()
        db_session.refresh(inv)
        assert float(inv.quantity) == pytest.approx(4, abs=0.001), \
            f"Stock descontado dos veces: quedó {inv.quantity}"

    def test_negative_quantity_rejected(self, client, db_session, admin_headers):
        """Cantidad negativa en ítem → 422 (Field gt=0)."""
        make_product(db_session, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": -1}],
            "payment_method": "cash",
        }, headers=admin_headers)
        assert r.status_code == 422

    def test_unknown_product_returns_404(self, client, admin_headers):
        """Producto que no existe → 404, no 500."""
        r = client.post("/api/sales", json={
            "items": [{"product_id": "producto-que-no-existe", "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 5000,
        }, headers=admin_headers)
        assert r.status_code in [400, 404]

    def test_sql_injection_in_product_id_is_safe(self, client, admin_headers):
        """Payload malicioso en product_id → no debe crashear ni filtrar datos."""
        malicious = "'; DROP TABLE products; --"
        r = client.post("/api/sales", json={
            "items": [{"product_id": malicious, "quantity": 1}],
            "payment_method": "cash",
            "cash_tendered": 5000,
        }, headers=admin_headers)
        # Debe retornar 404 (producto no existe) o 422, NUNCA 500
        assert r.status_code in [400, 404, 422], \
            f"Posible SQL injection: status {r.status_code}"

    def test_unauthenticated_request_rejected(self, client, db_session):
        """Sin token → 401 (guard activo en POST /sales)."""
        make_product(db_session, stock=5)
        r = client.post("/api/sales", json={
            "items": [{"product_id": "prod-test-001", "quantity": 1}],
            "payment_method": "cash",
        })
        assert r.status_code == 401
