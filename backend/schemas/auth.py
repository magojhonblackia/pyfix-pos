import json
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    username: str
    password: str = Field(max_length=72)  # bcrypt trunca en 72 bytes — rechazar antes


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    full_name: str
    role: str
    permissions: list[str] = []


class UserOut(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    is_active: int
    permissions: list[str] = []

    model_config = {"from_attributes": True}

    @field_validator("permissions", mode="before")
    @classmethod
    def parse_permissions(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v or []


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str
    permissions: list[str] = []


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[int] = None
    permissions: Optional[list[str]] = None
