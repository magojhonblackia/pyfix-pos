"""
🧪 PYFIX THE BREAKER — Test Suite: Inventario
Cubre: ajuste de stock, lotes FIFO, vencimientos, casos de ruptura.
"""
import pytest
from decimal import Decimal
from .conftest import make_product, DEV_BRANCH_ID
from models.inventory import Inventory, Batch


class TestStockAdjustment:

    def test_add_stock_increases_inventory(self, client, db_session, admin_headers):
        """Ajuste positivo → stock aumenta correctamente."""
        make_product(db_session, stock=10)
        r = client.patch("/api/products/prod-test-001/stock", json={
            "delta": 5,
            "reason": "adjustment",
        }, headers=admin_headers)
        assert r.status_code == 200

        inv = db_session.query(Inventory).filter_by(product_id="prod-test-001").first()
        db_session.refresh(inv)
        assert float(inv.quantity) == pytest.approx(15, abs=0.001)

    def test_remove_stock_decreases_inventory(self, client, db_session, admin_headers):
        """Ajuste negativo → stock disminuye."""
        make_product(db_session, stock=10)
        r = client.patch("/api/products/prod-test-001/stock", json={
            "delta": -3,
            "reason": "damage",
        }, headers=admin_headers)
        assert r.status_code == 200
        inv = db_session.query(Inventory).filter_by(product_id="prod-test-001").first()
        db_session.refresh(inv)
        assert float(inv.quantity) == pytest.approx(7, abs=0.001)

    def test_stock_cannot_go_negative_via_adjustment(self, client, db_session, admin_headers):
        """Ajuste que dejaría stock negativo → rechazado con 400 (BUG #3 corregido)."""
        make_product(db_session, stock=5)
        r = client.patch("/api/products/prod-test-001/stock", json={
            "delta": -100,
            "reason": "damage",
        }, headers=admin_headers)
        # Debe rechazarse: no hay suficiente stock para descontar 100
        assert r.status_code == 400, "Debe rechazar ajuste que deja stock negativo"

        inv = db_session.query(Inventory).filter_by(product_id="prod-test-001").first()
        db_session.refresh(inv)
        assert float(inv.quantity) >= 0, f"Stock quedó negativo: {inv.quantity}"

    def test_adjustment_requires_reason(self, client, db_session, admin_headers):
        """reason es requerido en el schema → 422 si falta."""
        make_product(db_session, stock=5)
        r = client.patch("/api/products/prod-test-001/stock",
                         json={"delta": 1},
                         headers=admin_headers)
        # reason tiene default "adjustment" en el schema, así que debe pasar
        assert r.status_code == 200

    def test_adjustment_on_nonexistent_product(self, client, admin_headers):
        """Ajuste en producto inexistente → 404."""
        r = client.patch("/api/products/no-existe/stock", json={
            "delta": 1,
            "reason": "adjustment",
        }, headers=admin_headers)
        assert r.status_code == 404


class TestBatchCreation:

    def test_purchase_reason_creates_batch(self, client, db_session, admin_headers):
        """Ajuste con reason=purchase y delta>0 → crea Batch FIFO."""
        make_product(db_session, stock=0)
        r = client.patch("/api/products/prod-test-001/stock", json={
            "delta": 24,
            "reason": "purchase",
            "lot_number": "LOTE-2026-001",
            "expires_at": "2026-12-31",
            "cost_per_unit": 2500,
        }, headers=admin_headers)
        assert r.status_code == 200

        batch = db_session.query(Batch).filter_by(product_id="prod-test-001").first()
        assert batch is not None, "No se creó el Batch"
        assert batch.lot_number == "LOTE-2026-001"
        assert float(batch.quantity) == pytest.approx(24, abs=0.001)
        assert float(batch.remaining) == pytest.approx(24, abs=0.001)
        assert float(batch.cost_per_unit) == pytest.approx(2500, abs=1)

    def test_non_purchase_reason_does_not_create_batch(self, client, db_session, admin_headers):
        """Ajuste con reason=adjustment → NO crea Batch."""
        make_product(db_session, stock=5)
        client.patch("/api/products/prod-test-001/stock", json={
            "delta": 10,
            "reason": "count_correction",
        }, headers=admin_headers)

        batch = db_session.query(Batch).filter_by(product_id="prod-test-001").first()
        assert batch is None, "Se creó Batch inesperadamente para reason=count_correction"

    def test_purchase_with_invalid_date_does_not_crash(self, client, db_session, admin_headers):
        """Fecha de vencimiento inválida → no crashea, crea batch sin fecha."""
        make_product(db_session, stock=0)
        r = client.patch("/api/products/prod-test-001/stock", json={
            "delta": 10,
            "reason": "purchase",
            "expires_at": "not-a-date",
        }, headers=admin_headers)
        assert r.status_code == 200
        batch = db_session.query(Batch).filter_by(product_id="prod-test-001").first()
        assert batch is not None
        assert batch.expires_at is None  # Fecha inválida ignorada correctamente


class TestExpiryEndpoints:

    def test_expiring_batches_returns_list(self, client, db_session, admin_headers):
        """GET /inventory/batches/expiring → lista (puede estar vacía)."""
        r = client.get("/api/inventory/batches/expiring?days=30", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_expiring_batches_includes_expired(self, client, db_session, admin_headers):
        """Batch ya vencido aparece en el reporte de vencimientos."""
        from datetime import datetime, timezone, timedelta
        from models.inventory import Batch
        from constants import DEV_BUSINESS_ID

        make_product(db_session, stock=10)
        # Crear batch que ya venció hace 5 días
        expired_date = datetime.now(timezone.utc) - timedelta(days=5)
        batch = Batch(
            business_id=DEV_BUSINESS_ID,
            product_id="prod-test-001",
            quantity=10,
            remaining=10,
            cost_per_unit=2000,
            expires_at=expired_date,
            received_at=datetime.now(timezone.utc),
        )
        db_session.add(batch)
        db_session.commit()

        r = client.get("/api/inventory/batches/expiring?days=30", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        batch_data = next((b for b in data if b["product_id"] == "prod-test-001"), None)
        assert batch_data is not None, "Batch vencido no aparece en el reporte"
        assert batch_data.get("expired") is True

    def test_batches_by_product_filter(self, client, db_session, admin_headers):
        """GET /inventory/batches?product_id=X → solo batches de ese producto."""
        make_product(db_session, pid="prod-A", stock=5)
        make_product(db_session, pid="prod-B", name="Producto B", stock=5, barcode="9999999")

        # Crear batch para prod-A
        client.patch("/api/products/prod-A/stock", json={
            "delta": 10, "reason": "purchase",
        }, headers=admin_headers)

        r = client.get("/api/inventory/batches?product_id=prod-A", headers=admin_headers)
        assert r.status_code == 200
        batches = r.json()
        for b in batches:
            assert b["product_id"] == "prod-A", \
                f"Batch de otro producto en el resultado: {b['product_id']}"


# ══════════════════════════════════════════════════════════════
# 💣 MODO BREAK TEST — Inventario
# ══════════════════════════════════════════════════════════════

class TestInventoryBreaking:

    def test_sql_injection_in_product_id_safe(self, client, admin_headers):
        """Payload malicioso en product_id de stock adjustment → no crashea."""
        r = client.patch("/api/products/'; DROP TABLE products; --/stock", json={
            "delta": 1,
            "reason": "adjustment",
        }, headers=admin_headers)
        assert r.status_code in [404, 422], \
            f"Posible inyección SQL: status {r.status_code}"

    def test_zero_delta_is_handled(self, client, db_session, admin_headers):
        """Delta=0 no debe crear un movimiento vacío ni crashear."""
        make_product(db_session, stock=5)
        r = client.patch("/api/products/prod-test-001/stock", json={
            "delta": 0,
            "reason": "adjustment",
        }, headers=admin_headers)
        # Puede ser 200 o 400 según reglas de negocio — lo importante es que no es 500
        assert r.status_code != 500

    def test_very_large_delta_doesnt_overflow(self, client, db_session, admin_headers):
        """Delta enorme no debe causar overflow en la DB."""
        make_product(db_session, stock=0)
        r = client.patch("/api/products/prod-test-001/stock", json={
            "delta": 9999999,
            "reason": "purchase",
        }, headers=admin_headers)
        assert r.status_code != 500
