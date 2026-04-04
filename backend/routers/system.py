"""
system.py — Información de versión y auto-actualización
=========================================================
Endpoints:
  GET  /api/system/version       → versión instalada actualmente
  GET  /api/system/check-update  → compara con el último release de GitHub
  POST /api/system/apply-update  → descarga el instalador y lo ejecuta (bg)
"""
import sys
import os
import threading
import urllib.request
import urllib.error
import json
import tempfile
import subprocess
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import config as _cfg
from deps import get_current_user, require_role
from models.user import User

router = APIRouter(prefix="/system", tags=["system"])

# ── Versión de la aplicación instalada ────────────────────────
# Cambiar este valor cada vez que se genera un nuevo instalador.
# En Railway (nube) no importa porque el check apunta a GitHub.
APP_VERSION = os.getenv("APP_VERSION", _cfg.APP_VERSION)

# ── Repositorio GitHub para check de actualizaciones ──────────
GITHUB_REPO = os.getenv("GITHUB_REPO", _cfg.GITHUB_REPO)
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")   # opcional — para repos privados


# ── Helpers ───────────────────────────────────────────────────

def _version_tuple(v: str) -> tuple:
    """'3.1.0' → (3, 1, 0) para comparación semántica."""
    try:
        return tuple(int(x) for x in v.lstrip("vV").split("."))
    except Exception:
        return (0, 0, 0)


def _version_gt(a: str, b: str) -> bool:
    return _version_tuple(a) > _version_tuple(b)


def _http_get_json(url: str, timeout: int = 15) -> dict:
    headers = {"User-Agent": "PyfixPOS-Updater/1.0"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _download_and_launch(url: str) -> None:
    """Descarga el instalador en un hilo y lo ejecuta al terminar."""
    try:
        print(f"[updater] Descargando: {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "PyfixPOS-Updater/1.0"})
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = resp.read()

        tmp_path = os.path.join(tempfile.gettempdir(), "PosFixio-Setup-update.exe")
        with open(tmp_path, "wb") as f:
            f.write(data)

        print(f"[updater] Lanzando instalador: {tmp_path}")
        # /SILENT hace la instalación con mínima interacción (Inno Setup flag)
        subprocess.Popen([tmp_path, "/SILENT"], close_fds=True)
    except Exception as exc:
        print(f"[updater] ERROR durante la actualización: {exc}")


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/version")
def get_version():
    """Devuelve la versión instalada en este equipo."""
    return {
        "version": APP_VERSION,
        "service": "pyfix-pos",
        "frozen":  getattr(sys, "frozen", False),   # True = corre como .exe compilado
    }


@router.get("/check-update")
def check_update(_u: User = Depends(get_current_user)):
    """
    Consulta el último release de GitHub y determina si hay una
    versión más reciente que la instalada.
    """
    try:
        release = _http_get_json(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        )
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return {
                "current_version":  APP_VERSION,
                "latest_version":   None,
                "update_available": False,
                "error": "Repositorio no encontrado o sin releases publicados.",
            }
        return {
            "current_version":  APP_VERSION,
            "latest_version":   None,
            "update_available": False,
            "error": f"GitHub API error {exc.code}",
        }
    except Exception as exc:
        return {
            "current_version":  APP_VERSION,
            "latest_version":   None,
            "update_available": False,
            "error": str(exc),
        }

    latest_tag = release.get("tag_name", "").lstrip("vV")
    assets     = release.get("assets", [])

    # Buscar el .exe del instalador entre los assets
    installer_url = next(
        (a["browser_download_url"] for a in assets if a["name"].lower().endswith(".exe")),
        None,
    )

    return {
        "current_version":  APP_VERSION,
        "latest_version":   latest_tag,
        "update_available": _version_gt(latest_tag, APP_VERSION),
        "installer_url":    installer_url,
        "release_url":      release.get("html_url"),
        "release_notes":    release.get("body", ""),
        "published_at":     release.get("published_at"),
    }


class _UpdateBody(BaseModel):
    installer_url: str


@router.post("/apply-update")
def apply_update(
    body: _UpdateBody,
    _u: User = Depends(require_role("admin")),
):
    """
    Descarga el instalador en segundo plano y lo ejecuta al terminar.
    El instalador (Inno Setup /SILENT) detiene el backend y actualiza los archivos.
    El usuario solo necesita esperar ~1 min hasta que el instalador abra.
    """
    if not body.installer_url.startswith("https://"):
        raise HTTPException(400, "URL de instalador no válida")

    t = threading.Thread(
        target=_download_and_launch,
        args=(body.installer_url,),
        daemon=True,
    )
    t.start()

    return {
        "ok": True,
        "message": (
            "Descargando actualización en segundo plano. "
            "El instalador se ejecutará automáticamente al terminar. "
            "No cierres la aplicación."
        ),
    }
