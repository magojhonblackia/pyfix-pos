from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_role
from models.user import User
from models.settings import BusinessSettings
from constants import DEV_BUSINESS_ID

router = APIRouter(prefix="/settings", tags=["settings"])


# ── Schemas ───────────────────────────────────────────────────

class SettingsOut(BaseModel):
    businessName:      str
    nit:               str
    address:           str
    phone:             str
    receiptFooter:     str
    minStockThreshold: int

    model_config = {"from_attributes": True}


class SettingsPatch(BaseModel):
    businessName:      Optional[str] = None
    nit:               Optional[str] = None
    address:           Optional[str] = None
    phone:             Optional[str] = None
    receiptFooter:     Optional[str] = None
    minStockThreshold: Optional[int] = None


# ── Helper ────────────────────────────────────────────────────

def _get_or_create(db: Session) -> BusinessSettings:
    row = db.get(BusinessSettings, DEV_BUSINESS_ID)
    if row is None:
        row = BusinessSettings(business_id=DEV_BUSINESS_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _to_out(row: BusinessSettings) -> SettingsOut:
    return SettingsOut(
        businessName=row.business_name,
        nit=row.nit,
        address=row.address,
        phone=row.phone,
        receiptFooter=row.receipt_footer,
        minStockThreshold=row.min_stock_threshold,
    )


# ── Endpoints ─────────────────────────────────────────────────

@router.get("", response_model=SettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user),
):
    return _to_out(_get_or_create(db))


@router.patch("", response_model=SettingsOut)
def update_settings(
    data: SettingsPatch,
    db: Session = Depends(get_db),
    _u: User = Depends(require_role("admin", "supervisor")),
):
    row = _get_or_create(db)
    if data.businessName      is not None: row.business_name      = data.businessName
    if data.nit               is not None: row.nit                = data.nit
    if data.address           is not None: row.address            = data.address
    if data.phone             is not None: row.phone              = data.phone
    if data.receiptFooter     is not None: row.receipt_footer     = data.receiptFooter
    if data.minStockThreshold is not None: row.min_stock_threshold = data.minStockThreshold
    db.commit()
    db.refresh(row)
    return _to_out(row)
