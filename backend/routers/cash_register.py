from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from decimal import Decimal

from database import get_db
from models.sale import Sale, CashRegister
from models.petty_cash import PettyCashExpense
from models.user import User
from schemas.cash_register import (
    OpenRegisterRequest,
    CloseRegisterRequest,
    CashRegisterResponse,
    PettyCashExpenseCreate,
    PettyCashExpenseResponse,
)
from constants import DEV_BUSINESS_ID, DEV_TERMINAL_ID
from deps import get_current_user

router = APIRouter(prefix="/cash-registers", tags=["cash-registers"])


def _sales_in_shift(db: Session, opened_at: datetime):
    """Ventas completadas desde que abrió el turno."""
    sales = (
        db.query(Sale)
        .filter(
            Sale.business_id == DEV_BUSINESS_ID,
            Sale.created_at >= opened_at,
            Sale.deleted_at.is_(None),
            Sale.status == "completed",
        )
        .all()
    )
    total = sum(float(s.total) for s in sales)
    return len(sales), total


def _expenses_in_shift(db: Session, register_id: str) -> float:
    """Suma de gastos de caja menor del turno."""
    expenses = (
        db.query(PettyCashExpense)
        .filter(PettyCashExpense.cash_register_id == register_id)
        .all()
    )
    return sum(float(e.amount) for e in expenses)


def _active(db: Session) -> CashRegister | None:
    return (
        db.query(CashRegister)
        .filter(
            CashRegister.business_id == DEV_BUSINESS_ID,
            CashRegister.terminal_id == DEV_TERMINAL_ID,
            CashRegister.status == "open",
        )
        .first()
    )


@router.get("/current", response_model=CashRegisterResponse | None)
def get_current(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    reg = _active(db)
    if not reg:
        return None
    count, total = _sales_in_shift(db, reg.opened_at)
    expenses     = _expenses_in_shift(db, reg.id)
    return CashRegisterResponse.from_orm(reg, count, total, expenses)


@router.post("/open", response_model=CashRegisterResponse, status_code=201)
def open_register(data: OpenRegisterRequest, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    if _active(db):
        raise HTTPException(status_code=400, detail="Ya hay un turno abierto en esta terminal")

    reg = CashRegister(
        business_id=DEV_BUSINESS_ID,
        terminal_id=DEV_TERMINAL_ID,
        user_id=_u.id,
        status="open",
        opening_amount=Decimal(str(data.opening_amount)),
        opened_at=datetime.now(timezone.utc),
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return CashRegisterResponse.from_orm(reg, 0, 0.0)


@router.post("/close", response_model=CashRegisterResponse)
def close_register(data: CloseRegisterRequest, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    reg = _active(db)
    if not reg:
        raise HTTPException(status_code=400, detail="No hay turno abierto")

    count, sales_total = _sales_in_shift(db, reg.opened_at)
    expenses_total     = _expenses_in_shift(db, reg.id)
    expected = float(reg.opening_amount) + sales_total - expenses_total
    closing  = data.closing_amount
    variance = closing - expected

    reg.status          = "closed"
    reg.closing_amount  = Decimal(str(closing))
    reg.expected_amount = Decimal(str(expected))
    reg.variance        = Decimal(str(variance))
    reg.closed_at       = datetime.now(timezone.utc)

    db.commit()
    db.refresh(reg)
    return CashRegisterResponse.from_orm(reg, count, sales_total, expenses_total)


# ── Gastos de caja menor ──────────────────────────────────────

@router.post("/expenses", response_model=PettyCashExpenseResponse, status_code=201)
def add_expense(data: PettyCashExpenseCreate, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Registra un gasto de caja menor en el turno activo."""
    reg = _active(db)
    if not reg:
        raise HTTPException(400, "No hay turno abierto. Abre un turno para registrar gastos.")
    if data.amount <= 0:
        raise HTTPException(400, "El monto debe ser mayor a 0")
    expense = PettyCashExpense(
        business_id=DEV_BUSINESS_ID,
        cash_register_id=reg.id,
        user_id=_u.id,
        amount=Decimal(str(data.amount)),
        category=data.category,
        description=data.description.strip(),
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return PettyCashExpenseResponse(
        id=expense.id,
        amount=float(expense.amount),
        category=expense.category,
        description=expense.description,
        created_at=expense.created_at,
    )


@router.get("/expenses", response_model=list[PettyCashExpenseResponse])
def list_expenses(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Lista gastos del turno activo."""
    reg = _active(db)
    if not reg:
        return []
    expenses = (
        db.query(PettyCashExpense)
        .filter(PettyCashExpense.cash_register_id == reg.id)
        .order_by(PettyCashExpense.created_at.desc())
        .all()
    )
    return [
        PettyCashExpenseResponse(
            id=e.id,
            amount=float(e.amount),
            category=e.category,
            description=e.description,
            created_at=e.created_at,
        )
        for e in expenses
    ]


@router.get("/history", response_model=list[CashRegisterResponse])
def get_history(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    regs = (
        db.query(CashRegister)
        .filter(CashRegister.business_id == DEV_BUSINESS_ID)
        .order_by(CashRegister.opened_at.desc())
        .limit(20)
        .all()
    )
    result = []
    for r in regs:
        count, total = _sales_in_shift(db, r.opened_at) if r.status == "open" else (0, 0.0)
        result.append(CashRegisterResponse.from_orm(r, count, total))
    return result
