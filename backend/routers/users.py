import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
import bcrypt as _bcrypt
from sqlalchemy.orm import Session

from database import get_db
from deps import require_role
from models.user import User
from models.base import uuid7str
from schemas.auth import UserCreate, UserOut, UserUpdate
from constants import DEV_BUSINESS_ID

router = APIRouter(prefix="/users", tags=["users"])

def _hash_pw(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()

VALID_ROLES = {"admin", "supervisor", "cashier", "accountant", "warehouse"}

VALID_ROUTES = [
    "/", "/pos", "/products", "/categories", "/inventory", "/sales",
    "/customers", "/suppliers", "/purchases", "/caja", "/reports",
    "/users", "/hardware", "/settings",
]


@router.get("/", response_model=list[UserOut])
def list_users(
    db:    Session = Depends(get_db),
    _user: User    = Depends(require_role("admin", "supervisor")),
):
    return (
        db.query(User)
        .filter(User.business_id == DEV_BUSINESS_ID, User.deleted_at == None)  # noqa: E711
        .order_by(User.full_name)
        .all()
    )


@router.post("/", response_model=UserOut, status_code=201)
def create_user(
    data:  UserCreate,
    db:    Session = Depends(get_db),
    _user: User    = Depends(require_role("admin")),
):
    if data.role not in VALID_ROLES:
        raise HTTPException(400, f"Rol inválido: '{data.role}'")
    if db.query(User).filter(
        User.business_id == DEV_BUSINESS_ID,
        User.username    == data.username,
    ).first():
        raise HTTPException(400, "El nombre de usuario ya existe")

    filtered_perms = [p for p in (data.permissions or []) if p in VALID_ROUTES]
    user = User(
        id            = uuid7str(),
        business_id   = DEV_BUSINESS_ID,
        username      = data.username,
        password_hash = _hash_pw(data.password),
        full_name     = data.full_name,
        role          = data.role,
        permissions   = json.dumps(filtered_perms),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    data:    UserUpdate,
    db:      Session = Depends(get_db),
    _user:   User    = Depends(require_role("admin")),
):
    user = db.get(User, user_id)
    if not user or user.business_id != DEV_BUSINESS_ID:
        raise HTTPException(404, "Usuario no encontrado")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        if data.role not in VALID_ROLES:
            raise HTTPException(400, f"Rol inválido: '{data.role}'")
        user.role = data.role
    if data.password is not None and data.password.strip():
        user.password_hash = _hash_pw(data.password)
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.permissions is not None:
        filtered_perms = [p for p in data.permissions if p in VALID_ROUTES]
        user.permissions = json.dumps(filtered_perms)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    db:      Session = Depends(get_db),
    _user:   User    = Depends(require_role("admin")),
):
    user = db.get(User, user_id)
    if not user or user.business_id != DEV_BUSINESS_ID:
        raise HTTPException(404, "Usuario no encontrado")
    db.delete(user)
    db.commit()
