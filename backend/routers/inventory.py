from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
from deps import get_current_user
from models.user import User
from models.inventory import Batch
from models.product import Product
from constants import DEV_BUSINESS_ID

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _batch_out(b: Batch) -> dict:
    return {
        "id":            b.id,
        "product_id":    b.product_id,
        "product_name":  b.product.name if b.product else None,
        "lot_number":    b.lot_number,
        "quantity":      float(b.quantity),
        "remaining":     float(b.remaining),
        "cost_per_unit": float(b.cost_per_unit),
        "expires_at":    b.expires_at.isoformat() if b.expires_at else None,
        "received_at":   b.received_at.isoformat(),
        "created_at":    b.created_at.isoformat(),
    }


@router.get("/batches")
def list_batches(
    product_id: str | None = None,
    only_active: bool = True,
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user),
):
    """Lista todos los lotes del negocio, opcionalmente filtrando por producto."""
    q = (
        db.query(Batch)
        .options(joinedload(Batch.product))
        .filter(Batch.business_id == DEV_BUSINESS_ID)
    )
    if product_id:
        q = q.filter(Batch.product_id == product_id)
    if only_active:
        q = q.filter(Batch.remaining > 0)
    q = q.order_by(Batch.received_at.desc())
    return [_batch_out(b) for b in q.all()]


@router.get("/batches/expiring")
def list_expiring_batches(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user),
):
    """Lotes que vencen dentro de `days` días (incluyendo ya vencidos)."""
    cutoff = datetime.now(timezone.utc) + timedelta(days=days)
    batches = (
        db.query(Batch)
        .options(joinedload(Batch.product))
        .filter(
            Batch.business_id == DEV_BUSINESS_ID,
            Batch.expires_at.isnot(None),
            Batch.expires_at <= cutoff,
            Batch.remaining > 0,
        )
        .order_by(Batch.expires_at.asc())
        .all()
    )
    now = datetime.now(timezone.utc)
    result = []
    for b in batches:
        out = _batch_out(b)
        # SQLite devuelve datetimes sin tzinfo — normalizar antes de restar
        exp = b.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        delta = (exp - now).days
        out["days_until_expiry"] = delta
        out["expired"] = delta < 0
        result.append(out)
    return result
