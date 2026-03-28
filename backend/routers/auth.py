import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
import bcrypt as _bcrypt
from sqlalchemy.orm import Session

from database import get_db
from deps import create_access_token, get_current_user
from models.user import User
from schemas.auth import LoginRequest, TokenResponse, UserOut
from constants import DEV_BUSINESS_ID

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(
            User.business_id == DEV_BUSINESS_ID,
            User.username    == req.username,
            User.is_active   == 1,
        )
        .first()
    )
    if not user or not _bcrypt.checkpw(req.password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    perms = json.loads(user.permissions or "[]")

    token = create_access_token({
        "sub":         user.id,
        "role":        user.role,
        "business_id": DEV_BUSINESS_ID,
        "permissions": perms,
    })
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        permissions=perms,
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
