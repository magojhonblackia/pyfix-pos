"""
Sincronización en la nube — PYFIX POS
======================================
Dos conjuntos de endpoints en el mismo módulo:

  cloud_router  (sin prefijo /api)
    POST /sync/snapshot          → Railway recibe y almacena el backup
    GET  /sync/snapshot/{key}    → Railway entrega el backup

  local_router  (prefijado /api en main.py)
    GET  /sync/status            → stats locales + fechas de último push/pull
    POST /sync/push   {license_key, device_id} → exporta datos locales → cloud
    POST /sync/pull   {license_key}            → descarga cloud → importa local
"""
import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import config as _cfg
from database import get_db
from deps import get_current_user, require_role
from models.user import User
from models.product import Product, Category
from models.inventory import Inventory
from models.customer import Customer
from models.supplier import Supplier
from models.sale import Sale, SaleItem, Payment
from models.settings import BusinessSettings
from models.sync_snapshot import SyncSnapshot
from constants import DEV_BUSINESS_ID, DEV_BRANCH_ID, DEV_TERMINAL_ID, DEV_USER_ID

# ── Routers ────────────────────────────────────────────────────
cloud_router = APIRouter(prefix="/sync",     tags=["sync-cloud"])
local_router = APIRouter(prefix="/sync",     tags=["sync-local"])

_STATE_KEY = "__sync_state__"


# ══════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════

def _to_str(v) -> str | None:
    """Convierte Decimal o None a str; otros tipos los devuelve tal cual."""
    if v is None:
        return None
    if isinstance(v, Decimal):
        return str(v)
    return v


def _isoformat(dt) -> str | None:
    if dt is None:
        return None
    return dt.isoformat()


# ── Exportar datos locales ────────────────────────────────────

def _collect_local_data(db: Session) -> dict:
    """Exporta todos los datos locales como dict JSON-serializable."""
    biz_id = DEV_BUSINESS_ID

    # Settings
    sett = db.get(BusinessSettings, biz_id)
    settings: dict = {}
    if sett:
        settings = {
            "businessName":      sett.business_name,
            "nit":               sett.nit,
            "address":           sett.address,
            "phone":             sett.phone,
            "receiptFooter":     sett.receipt_footer,
            "minStockThreshold": sett.min_stock_threshold,
        }

    # Categorías
    cats = (
        db.query(Category)
        .filter(Category.business_id == biz_id, Category.deleted_at.is_(None))
        .all()
    )
    categories = [
        {
            "id":        c.id,
            "name":      c.name,
            "parent_id": c.parent_id,
        }
        for c in cats
    ]

    # Stock map (product_id → cantidad)
    inv_rows = (
        db.query(Inventory)
        .filter(Inventory.business_id == biz_id, Inventory.branch_id == DEV_BRANCH_ID)
        .all()
    )
    stock_map = {i.product_id: _to_str(i.quantity) for i in inv_rows}

    # Productos activos
    prods = (
        db.query(Product)
        .filter(
            Product.business_id == biz_id,
            Product.deleted_at.is_(None),
            Product.is_active == 1,
        )
        .all()
    )
    products = [
        {
            "id":             p.id,
            "name":           p.name,
            "barcode":        p.barcode,
            "sku":            p.sku,
            "description":    p.description,
            "price":          _to_str(p.price),
            "cost":           _to_str(p.cost),
            "tax_rate":       p.tax_rate,
            "category_id":    p.category_id,
            "min_stock":      _to_str(p.min_stock),
            "image_url":      p.image_url,
            "is_active":      p.is_active,
            "sold_by_weight": p.sold_by_weight,
            "stock":          stock_map.get(p.id, "0"),
            "created_at":     _isoformat(p.created_at),
            "updated_at":     _isoformat(p.updated_at),
        }
        for p in prods
    ]

    # Clientes
    custs = (
        db.query(Customer)
        .filter(Customer.business_id == biz_id, Customer.deleted_at.is_(None))
        .all()
    )
    customers = [
        {
            "id":              c.id,
            "name":            c.name,
            "document_type":   c.document_type,
            "document_number": c.document_number,
            "phone":           c.phone,
            "email":           c.email,
            "address":         c.address,
        }
        for c in custs
    ]

    # Proveedores
    supps = (
        db.query(Supplier)
        .filter(Supplier.business_id == biz_id, Supplier.deleted_at.is_(None))
        .all()
    )
    suppliers = [
        {
            "id":           s.id,
            "name":         s.name,
            "nit":          s.nit,
            "contact_name": s.contact_name,
            "phone":        s.phone,
            "email":        s.email,
            "address":      s.address,
        }
        for s in supps
    ]

    # Ventas (últimos 365 días)
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    sale_rows = (
        db.query(Sale)
        .filter(
            Sale.business_id == biz_id,
            Sale.deleted_at.is_(None),
            Sale.created_at >= cutoff,
        )
        .all()
    )
    sales = []
    for s in sale_rows:
        sales.append({
            "id":             s.id,
            "status":         s.status,
            "subtotal":       _to_str(s.subtotal),
            "discount_total": _to_str(s.discount_total),
            "tax_total":      _to_str(s.tax_total),
            "total":          _to_str(s.total),
            "cash_tendered":  _to_str(s.cash_tendered),
            "change_given":   _to_str(s.change_given),
            "notes":          s.notes,
            "created_at":     _isoformat(s.created_at),
            "items": [
                {
                    "id":            i.id,
                    "product_id":    i.product_id,
                    "product_name":  i.product_name,
                    "barcode":       i.barcode,
                    "quantity":      _to_str(i.quantity),
                    "unit_price":    _to_str(i.unit_price),
                    "discount_pct":  _to_str(i.discount_pct),
                    "tax_rate":      i.tax_rate,
                    "tax_amount":    _to_str(i.tax_amount),
                    "subtotal":      _to_str(i.subtotal),
                    "total":         _to_str(i.total),
                    "voided":        i.voided,
                }
                for i in s.items
            ],
            "payments": [
                {
                    "id":     p.id,
                    "method": p.method,
                    "amount": _to_str(p.amount),
                    "status": p.status,
                }
                for p in s.payments
            ],
        })

    return {
        "version":     1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "settings":    settings,
        "categories":  categories,
        "products":    products,
        "customers":   customers,
        "suppliers":   suppliers,
        "sales":       sales,
    }


# ── Importar datos desde snapshot ────────────────────────────

def _import_data(db: Session, data: dict) -> dict:
    """
    Importa datos de un snapshot en la base local.
    Estrategia: INSERT OR IGNORE (por ID) — nunca borra datos existentes.
    Actualiza precio/costo de productos si ya existen.
    """
    biz_id = DEV_BUSINESS_ID
    counts = {
        "categories": 0, "products": 0,
        "customers":  0, "suppliers": 0,
        "sales":      0, "settings":  False,
    }

    # ── Settings ────────────────────────────────────────────
    sett_data = data.get("settings") or {}
    if sett_data:
        sett = db.get(BusinessSettings, biz_id)
        if not sett:
            sett = BusinessSettings(business_id=biz_id)
            db.add(sett)
        if sett_data.get("businessName"):
            sett.business_name = sett_data["businessName"]
        if sett_data.get("nit"):
            sett.nit = sett_data["nit"]
        if sett_data.get("address"):
            sett.address = sett_data["address"]
        if sett_data.get("phone"):
            sett.phone = sett_data["phone"]
        if sett_data.get("receiptFooter"):
            sett.receipt_footer = sett_data["receiptFooter"]
        counts["settings"] = True

    # ── Categorías ──────────────────────────────────────────
    for c_data in data.get("categories") or []:
        if not db.get(Category, c_data["id"]):
            db.add(Category(
                id          = c_data["id"],
                business_id = biz_id,
                name        = c_data["name"],
                parent_id   = c_data.get("parent_id"),
            ))
            counts["categories"] += 1

    db.flush()  # FK para productos

    # ── Productos ───────────────────────────────────────────
    for p_data in data.get("products") or []:
        existing = db.get(Product, p_data["id"])
        if not existing:
            db.add(Product(
                id             = p_data["id"],
                business_id    = biz_id,
                name           = p_data["name"],
                barcode        = p_data.get("barcode"),
                sku            = p_data.get("sku"),
                description    = p_data.get("description"),
                price          = p_data.get("price", "0"),
                cost           = p_data.get("cost"),
                tax_rate       = p_data.get("tax_rate", "IVA_0"),
                category_id    = p_data.get("category_id"),
                min_stock      = p_data.get("min_stock", "0"),
                image_url      = p_data.get("image_url"),
                is_active      = p_data.get("is_active", 1),
                sold_by_weight = p_data.get("sold_by_weight", 0),
            ))
            counts["products"] += 1

            # Stock inicial
            stock_str = p_data.get("stock", "0")
            if Decimal(stock_str) > 0:
                db.add(Inventory(
                    business_id = biz_id,
                    branch_id   = DEV_BRANCH_ID,
                    product_id  = p_data["id"],
                    quantity    = stock_str,
                ))
        else:
            # Actualiza precio/costo si el producto ya existe
            if p_data.get("price"):
                existing.price = p_data["price"]
            if p_data.get("cost"):
                existing.cost = p_data["cost"]
            counts["products"] += 1

    db.flush()

    # ── Clientes ────────────────────────────────────────────
    for c_data in data.get("customers") or []:
        if not db.get(Customer, c_data["id"]):
            db.add(Customer(
                id              = c_data["id"],
                business_id     = biz_id,
                name            = c_data["name"],
                document_type   = c_data.get("document_type"),
                document_number = c_data.get("document_number"),
                phone           = c_data.get("phone"),
                email           = c_data.get("email"),
                address         = c_data.get("address"),
            ))
            counts["customers"] += 1

    # ── Proveedores ─────────────────────────────────────────
    for s_data in data.get("suppliers") or []:
        if not db.get(Supplier, s_data["id"]):
            db.add(Supplier(
                id           = s_data["id"],
                business_id  = biz_id,
                name         = s_data["name"],
                nit          = s_data.get("nit"),
                contact_name = s_data.get("contact_name"),
                phone        = s_data.get("phone"),
                email        = s_data.get("email"),
                address      = s_data.get("address"),
            ))
            counts["suppliers"] += 1

    db.flush()

    # ── Ventas ──────────────────────────────────────────────
    for s_data in data.get("sales") or []:
        if db.get(Sale, s_data["id"]):
            continue  # ya existe

        sale = Sale(
            id             = s_data["id"],
            business_id    = biz_id,
            branch_id      = DEV_BRANCH_ID,
            terminal_id    = DEV_TERMINAL_ID,
            user_id        = DEV_USER_ID,
            status         = s_data.get("status", "completed"),
            subtotal       = s_data.get("subtotal", "0"),
            discount_total = s_data.get("discount_total", "0"),
            tax_total      = s_data.get("tax_total", "0"),
            total          = s_data.get("total", "0"),
            cash_tendered  = s_data.get("cash_tendered", "0"),
            change_given   = s_data.get("change_given", "0"),
            notes          = s_data.get("notes"),
        )
        db.add(sale)

        for i_data in s_data.get("items") or []:
            db.add(SaleItem(
                id           = i_data["id"],
                sale_id      = s_data["id"],
                business_id  = biz_id,
                product_id   = i_data["product_id"],
                product_name = i_data["product_name"],
                barcode      = i_data.get("barcode"),
                quantity     = i_data.get("quantity", "1"),
                unit_price   = i_data.get("unit_price", "0"),
                discount_pct = i_data.get("discount_pct", "0"),
                discount_amount = "0",
                tax_rate     = i_data.get("tax_rate", "IVA_0"),
                tax_amount   = i_data.get("tax_amount", "0"),
                subtotal     = i_data.get("subtotal", "0"),
                total        = i_data.get("total", "0"),
                voided       = i_data.get("voided", 0),
            ))

        for p_data in s_data.get("payments") or []:
            db.add(Payment(
                id          = p_data["id"],
                sale_id     = s_data["id"],
                business_id = biz_id,
                method      = p_data.get("method", "cash"),
                amount      = p_data.get("amount", "0"),
                status      = p_data.get("status", "approved"),
            ))

        counts["sales"] += 1

    db.commit()
    return counts


# ── Estado de sync local ──────────────────────────────────────

def _load_sync_state(db: Session) -> dict:
    snap = db.query(SyncSnapshot).filter(SyncSnapshot.license_key == _STATE_KEY).first()
    if not snap:
        return {}
    try:
        return json.loads(snap.payload)
    except Exception:
        return {}


def _save_sync_state(db: Session, **updates) -> None:
    snap = db.query(SyncSnapshot).filter(SyncSnapshot.license_key == _STATE_KEY).first()
    if snap:
        state = _load_sync_state(db)
    else:
        state = {}
        snap = SyncSnapshot(license_key=_STATE_KEY, device_id="local", stats="{}")
        db.add(snap)
    state.update(updates)
    snap.payload    = json.dumps(state)
    snap.updated_at = datetime.now(timezone.utc)
    db.commit()


# ── HTTP helpers (stdlib, sin dependencias extra) ─────────────

def _http_post(url: str, body: dict, timeout: int = 45) -> dict:
    encoded = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data    = encoded,
        headers = {"Content-Type": "application/json"},
        method  = "POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _http_get(url: str, timeout: int = 45) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


# ══════════════════════════════════════════════════════════════
# CLOUD ROUTER  —  sin prefijo /api (Railway lo recibe)
# ══════════════════════════════════════════════════════════════

class _SnapshotPush(BaseModel):
    license_key: str
    device_id:   str
    payload:     str   # JSON crudo
    stats:       dict


@cloud_router.post("/snapshot")
def cloud_store_snapshot(data: _SnapshotPush, db: Session = Depends(get_db)):
    """
    Recibe y almacena el snapshot de un negocio.
    Auth implícita: quien conoce la license_key es el dueño.
    """
    if not data.license_key or len(data.license_key) < 6:
        raise HTTPException(400, "license_key inválida")

    now = datetime.now(timezone.utc)

    existing = (
        db.query(SyncSnapshot)
        .filter(SyncSnapshot.license_key == data.license_key)
        .first()
    )
    if existing:
        existing.device_id  = data.device_id
        existing.payload    = data.payload
        existing.stats      = json.dumps(data.stats)
        existing.updated_at = now
    else:
        db.add(SyncSnapshot(
            license_key = data.license_key,
            device_id   = data.device_id,
            payload     = data.payload,
            stats       = json.dumps(data.stats),
            created_at  = now,
            updated_at  = now,
        ))

    db.commit()
    return {"ok": True, "updated_at": now.isoformat()}


@cloud_router.get("/snapshot/{license_key}")
def cloud_get_snapshot(license_key: str, db: Session = Depends(get_db)):
    """Devuelve el snapshot más reciente de una licencia."""
    if not license_key or len(license_key) < 6:
        raise HTTPException(400, "license_key inválida")

    snap = (
        db.query(SyncSnapshot)
        .filter(SyncSnapshot.license_key == license_key)
        .first()
    )
    if not snap:
        raise HTTPException(404, "No existe respaldo en la nube para esta licencia")

    return {
        "ok":         True,
        "device_id":  snap.device_id,
        "stats":      json.loads(snap.stats) if snap.stats else {},
        "payload":    snap.payload,
        "updated_at": snap.updated_at.isoformat(),
    }


# ══════════════════════════════════════════════════════════════
# LOCAL ROUTER  —  prefijado /api en main.py
# ══════════════════════════════════════════════════════════════

@local_router.get("/status")
def get_sync_status(
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user),
):
    """Devuelve estadísticas locales y fechas de último push/pull."""
    biz_id = DEV_BUSINESS_ID
    state  = _load_sync_state(db)

    return {
        "last_push":       state.get("last_push"),
        "last_pull":       state.get("last_pull"),
        "cloud_url":       _cfg.CLOUD_SYNC_URL,
        "local_products":  (
            db.query(Product)
            .filter(Product.business_id == biz_id, Product.deleted_at.is_(None), Product.is_active == 1)
            .count()
        ),
        "local_categories": (
            db.query(Category)
            .filter(Category.business_id == biz_id, Category.deleted_at.is_(None))
            .count()
        ),
        "local_customers": (
            db.query(Customer)
            .filter(Customer.business_id == biz_id, Customer.deleted_at.is_(None))
            .count()
        ),
        "local_suppliers": (
            db.query(Supplier)
            .filter(Supplier.business_id == biz_id, Supplier.deleted_at.is_(None))
            .count()
        ),
        "local_sales": (
            db.query(Sale)
            .filter(Sale.business_id == biz_id, Sale.deleted_at.is_(None))
            .count()
        ),
    }


class _SyncPushBody(BaseModel):
    license_key: str
    device_id:   str = "local"


@local_router.post("/push")
def push_to_cloud(
    body: _SyncPushBody,
    db:   Session = Depends(get_db),
    _u:   User    = Depends(require_role("admin", "supervisor")),
):
    """
    Exporta todos los datos locales y los sube al servidor en la nube.
    El frontend envía la license_key (guardada en localStorage).
    """
    if not body.license_key:
        raise HTTPException(400, "Se requiere la clave de licencia para sincronizar")

    data  = _collect_local_data(db)
    stats = {
        "products":   len(data["products"]),
        "categories": len(data["categories"]),
        "customers":  len(data["customers"]),
        "suppliers":  len(data["suppliers"]),
        "sales":      len(data["sales"]),
    }

    try:
        _http_post(
            f"{_cfg.CLOUD_SYNC_URL}/sync/snapshot",
            body={
                "license_key": body.license_key,
                "device_id":   body.device_id,
                "payload":     json.dumps(data),
                "stats":       stats,
            },
        )
    except urllib.error.HTTPError as exc:
        raise HTTPException(exc.code, f"Error del servidor en la nube: {exc.reason}")
    except Exception as exc:
        raise HTTPException(503, f"No se pudo conectar al servidor en la nube: {exc}")

    pushed_at = datetime.now(timezone.utc).isoformat()
    _save_sync_state(db, last_push=pushed_at)

    return {"ok": True, "stats": stats, "pushed_at": pushed_at}


class _SyncPullBody(BaseModel):
    license_key: str


@local_router.post("/pull")
def pull_from_cloud(
    body: _SyncPullBody,
    db:   Session = Depends(get_db),
    _u:   User    = Depends(require_role("admin", "supervisor")),
):
    """
    Descarga el snapshot más reciente de la nube e importa los datos en SQLite local.
    Solo añade/actualiza — nunca elimina datos existentes.
    """
    if not body.license_key:
        raise HTTPException(400, "Se requiere la clave de licencia para sincronizar")

    try:
        cloud = _http_get(f"{_cfg.CLOUD_SYNC_URL}/sync/snapshot/{body.license_key}")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise HTTPException(404, "No hay respaldo en la nube para esta licencia. Sube los datos primero desde el equipo original.")
        raise HTTPException(exc.code, f"Error del servidor en la nube: {exc.reason}")
    except Exception as exc:
        raise HTTPException(503, f"No se pudo conectar al servidor en la nube: {exc}")

    snapshot_data = json.loads(cloud["payload"])
    imported      = _import_data(db, snapshot_data)

    pulled_at = datetime.now(timezone.utc).isoformat()
    _save_sync_state(db, last_pull=pulled_at)

    return {
        "ok":              True,
        "imported":        imported,
        "cloud_updated_at": cloud["updated_at"],
        "cloud_stats":     cloud.get("stats", {}),
        "pulled_at":       pulled_at,
    }
