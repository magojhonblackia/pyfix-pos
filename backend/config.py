"""
Configuración central — lee variables de entorno con fallback a valores de desarrollo.
Importar este módulo en main.py garantiza que load_dotenv() se ejecuta primero.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ── Base de datos ──────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pyfix_local.db")

# ── JWT ───────────────────────────────────────────────────────
SECRET_KEY                 = os.getenv("SECRET_KEY", "pyfix-dev-secret-change-in-production-2024")
ACCESS_TOKEN_EXPIRE_HOURS  = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "8"))

# ── CORS ──────────────────────────────────────────────────────
# Para uso interno en red LAN se acepta "*". En producción restringir a orígenes conocidos.
# Clientes en red local deben apuntar a: VITE_API_BASE=http://IP_SERVIDOR:8765/api
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "*",
).split(",")

# ── Servidor ──────────────────────────────────────────────────
# 0.0.0.0 expone el backend en todas las interfaces de red (LAN incluida).
# Para restringir a localhost usar: API_HOST=127.0.0.1
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8765"))

# ── Hardware ──────────────────────────────────────────────────
HARDWARE_MOCK = os.getenv("HARDWARE_MOCK", "true").lower() == "true"
