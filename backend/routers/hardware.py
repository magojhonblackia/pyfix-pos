"""
Hardware router — Balanza RS-232, Impresora ESC/POS, Cajón de dinero.

Modo mock (por defecto en dev): todos los endpoints retornan datos simulados
sin requerir hardware físico.  Activar hardware real: HARDWARE_MOCK=false
"""

import hashlib
import json
import math
import time
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import HARDWARE_MOCK as MOCK_MODE
from database import get_db
from models.audit import AuditLog
from models.base import uuid7str
from constants import DEV_BUSINESS_ID, DEV_USER_ID

# IDs de desarrollo para el AuditLog (sin auth real en hardware endpoints por ahora)
_TERMINAL_ID = "00000000-0000-7000-8000-000000000099"
_HARDWARE_ID = "dev-hardware-mock"
_USER_NAME   = "Sistema"

router = APIRouter(prefix="/hardware", tags=["hardware"])

# ─── Estado en memoria (singleton por proceso) ───────────────────────────────

_scale: dict = {
    "connected": False,
    "port":      None,
    "protocol":  None,
    "weight":    None,
    "stable":    False,
    "error":     None,
    "_thread":   None,
    "_serial":   None,
}

# ─── Schemas ──────────────────────────────────────────────────────────────────

class ScaleConnectIn(BaseModel):
    port:     str
    protocol: str = "cas"   # cas | toledo | mettler | generic

class PrintReceiptIn(BaseModel):
    sale_id:        str
    business_name:  str = "Minimarket"
    items:          list[dict]
    subtotal:       float
    discount:       float = 0.0
    total:          float
    payment_method: str
    cash_tendered:  Optional[float] = None
    change_given:   Optional[float] = None
    cashier_name:   str = ""
    payments:       Optional[list[dict]] = None   # pago dividido

class DrawerOpenIn(BaseModel):
    sale_id:   Optional[str] = None
    reason:    str = "sale"          # sale | manual | shift_end
    user_id:   str = DEV_USER_ID
    user_name: str = _USER_NAME

# ─── Helper: AuditLog ────────────────────────────────────────────────────────

def _audit(db: Session, action: str, entity_id: str, new_state: dict, reason: str) -> None:
    last_hash = db.execute(
        select(AuditLog.hash_self)
        .where(AuditLog.business_id == DEV_BUSINESS_ID)
        .order_by(AuditLog.timestamp.desc())
        .limit(1)
    ).scalar_one_or_none() or "genesis"

    now = datetime.now(timezone.utc)
    content = json.dumps({
        "timestamp":   now.isoformat(),
        "business_id": DEV_BUSINESS_ID,
        "action":      action,
        "entity_type": "hardware",
        "entity_id":   entity_id,
        "new_state":   new_state,
        "hash_prev":   last_hash,
    }, sort_keys=True)
    hash_self = hashlib.sha256(content.encode()).hexdigest()

    db.add(AuditLog(
        id          = uuid7str(),
        timestamp   = now,
        business_id = DEV_BUSINESS_ID,
        user_id     = DEV_USER_ID,
        user_name   = _USER_NAME,
        terminal_id = _TERMINAL_ID,
        hardware_id = _HARDWARE_ID,
        action      = action,
        entity_type = "hardware",
        entity_id   = entity_id,
        new_state   = json.dumps(new_state),
        reason      = reason,
        ip_address  = "127.0.0.1",
        hash_prev   = last_hash,
        hash_self   = hash_self,
    ))
    db.commit()

# ─── Parsers de protocolo RS-232 ─────────────────────────────────────────────

def _parse_cas(data: bytes) -> Optional[float]:
    """CAS LP/CI: 'ST,GS,+001.200kg<CR><LF>'"""
    try:
        s = data.decode("ascii", errors="ignore").strip()
        if "," not in s:
            return None
        parts = s.split(",")
        raw = parts[-1].lower().replace("kg", "").replace("g", "").replace("+", "").replace("-", "").strip()
        val = float(raw)
        # Si la unidad era gramos, convertir a kg
        if "kg" not in parts[-1].lower() and "g" in parts[-1].lower():
            val /= 1000
        return round(val, 3)
    except Exception:
        return None

def _parse_toledo(data: bytes) -> Optional[float]:
    """Toledo 8142/8217: ' +  1.200<CR><LF>'"""
    try:
        s = data.decode("ascii", errors="ignore").strip()
        s = s.replace("+", "").replace("-", "").replace(" ", "")
        return round(float(s), 3) if s else None
    except Exception:
        return None

def _parse_mettler(data: bytes) -> Optional[float]:
    """Mettler MT-SICS respuesta a 'S\\r\\n': 'S S  +0.250 kg<CR><LF>'"""
    try:
        s = data.decode("ascii", errors="ignore").strip()
        parts = s.split()
        if len(parts) >= 3 and parts[0] in ("S", "SD", "SI"):
            raw = parts[2].replace("+", "").replace("-", "")
            val = float(raw)
            unit = parts[3].lower() if len(parts) > 3 else "kg"
            if unit == "g":
                val /= 1000
            return round(val, 3)
    except Exception:
        pass
    return None

def _parse_generic(data: bytes) -> Optional[float]:
    """Intenta extraer cualquier número flotante de la trama."""
    try:
        import re
        s = data.decode("ascii", errors="ignore")
        nums = re.findall(r"[+-]?\d+\.?\d*", s)
        if nums:
            return round(abs(float(nums[0])), 3)
    except Exception:
        pass
    return None

_PARSERS = {
    "cas":     (_parse_cas,     9600),
    "toledo":  (_parse_toledo,  2400),
    "mettler": (_parse_mettler, 9600),
    "generic": (_parse_generic, 9600),
}

STABLE_COUNT = 5
STABLE_THRESHOLD = 0.005   # kg

def _scale_thread(port: str, protocol: str) -> None:
    """Hilo daemon — lee peso en bucle y actualiza _scale."""
    try:
        import serial  # pyserial
    except ImportError:
        _scale["error"] = "pyserial no instalado (pip install pyserial)"
        _scale["connected"] = False
        return

    parser, baud = _PARSERS.get(protocol, _PARSERS["generic"])
    send_cmd = (protocol == "mettler")   # Mettler requiere solicitar

    readings: list[float] = []
    try:
        ser = serial.Serial(port, baudrate=baud, bytesize=8,
                            parity="N", stopbits=1, timeout=1)
        _scale["_serial"]   = ser
        _scale["connected"] = True
        _scale["error"]     = None

        while _scale["connected"]:
            if send_cmd:
                ser.write(b"S\r\n")
            raw = ser.readline()
            if raw:
                val = parser(raw)
                if val is not None and val >= 0:
                    readings.append(val)
                    if len(readings) > STABLE_COUNT * 2:
                        readings = readings[-STABLE_COUNT * 2:]
                    _scale["weight"] = val
                    if len(readings) >= STABLE_COUNT:
                        window = readings[-STABLE_COUNT:]
                        _scale["stable"] = (max(window) - min(window)) < STABLE_THRESHOLD
                    else:
                        _scale["stable"] = False
        ser.close()
    except Exception as e:
        _scale["connected"] = False
        _scale["error"]     = str(e)

# ─── Helpers ESC/POS ──────────────────────────────────────────────────────────

def _cop(val: float) -> str:
    return f"${val:,.0f}".replace(",", ".")

def _escpos_receipt(req: PrintReceiptIn) -> None:
    """Imprime recibo en impresora térmica real vía python-escpos."""
    try:
        from escpos.printer import Usb, Serial as EscSerial
    except ImportError:
        raise HTTPException(503, "python-escpos no instalado (pip install python-escpos)")

    try:
        # Xprinter XP-58IIL (muy común en Colombia) — fallback a primer USB térmico
        try:
            p = Usb(0x0416, 0x5011, timeout=0, in_ep=0x81, out_ep=0x03)
        except Exception:
            p = Usb(0x0483, 0x5840, timeout=0)   # Bixolon SRP-350III alternativo
    except Exception as e:
        raise HTTPException(503, f"No se encontró impresora USB: {e}")

    p.set(align="center", bold=True, double_height=True, double_width=False)
    p.text(f"{req.business_name}\n")
    p.set(align="center", bold=False, double_height=False)
    p.text("─" * 32 + "\n")
    p.text(f"Venta #{req.sale_id[:12].upper()}\n")
    p.text(f"{datetime.now().strftime('%d/%m/%Y  %H:%M')}\n")
    if req.cashier_name:
        p.text(f"Cajero: {req.cashier_name}\n")
    p.text("─" * 32 + "\n")

    p.set(align="left")
    for item in req.items:
        name  = str(item.get("name", ""))[:22]
        qty   = item.get("quantity", 1)
        price = item.get("price", 0)
        total = qty * price
        p.text(f"{name}\n")
        p.text(f"  {qty} x {_cop(price):>10}  {_cop(total):>10}\n")

    p.text("─" * 32 + "\n")
    if req.discount > 0:
        p.text(f"{'Subtotal':<20}{_cop(req.subtotal):>12}\n")
        p.text(f"{'Descuento':<20}{_cop(-req.discount):>12}\n")

    p.set(bold=True)
    p.text(f"{'TOTAL':<20}{_cop(req.total):>12}\n")
    p.set(bold=False)
    p.text("─" * 32 + "\n")

    if req.payments and len(req.payments) > 1:
        p.text("Pagos:\n")
        for pay in req.payments:
            m = pay.get("method", "").upper()
            a = pay.get("amount", 0)
            p.text(f"  {m:<16}{_cop(a):>14}\n")
    else:
        m = req.payment_method.upper()
        p.text(f"{m:<20}{_cop(req.total):>12}\n")
        if req.cash_tendered:
            p.text(f"{'Recibido':<20}{_cop(req.cash_tendered):>12}\n")
            if req.change_given is not None:
                p.text(f"{'Cambio':<20}{_cop(req.change_given):>12}\n")

    p.set(align="center")
    p.text("\n¡Gracias por su compra!\n")
    p.text("\n\n\n")
    p.cut()
    p.close()

def _escpos_open_drawer() -> None:
    """Envía pulso de apertura al cajón conectado al puerto cash drawer de la impresora."""
    try:
        from escpos.printer import Usb
        try:
            p = Usb(0x0416, 0x5011, timeout=0, in_ep=0x81, out_ep=0x03)
        except Exception:
            p = Usb(0x0483, 0x5840, timeout=0)
        # ESC p m t1 t2 — pulso en pin 2 (m=0) con duración 25ms/250ms
        p._raw(b"\x1b\x70\x00\x19\xfa")
        p.close()
    except Exception:
        pass   # No fallar la venta si el cajón no responde

# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints — Balanza
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/scale/ports", summary="Lista puertos seriales disponibles")
def list_ports():
    if MOCK_MODE:
        return {"ports": ["COM3", "COM4", "/dev/ttyUSB0", "/dev/ttyUSB1"], "mock": True}
    try:
        import serial.tools.list_ports
        details = [{"port": p.device, "description": p.description}
                   for p in serial.tools.list_ports.comports()]
        return {"ports": [d["port"] for d in details], "details": details}
    except ImportError:
        raise HTTPException(503, "pyserial no instalado")


@router.post("/scale/connect", summary="Conecta balanza RS-232")
def connect_scale(req: ScaleConnectIn):
    if MOCK_MODE:
        _scale.update(connected=True, port=req.port, protocol=req.protocol, error=None)
        return {"ok": True, "mock": True}
    if _scale["connected"]:
        return {"ok": True, "already_connected": True}
    _scale.update(port=req.port, protocol=req.protocol)
    t = threading.Thread(target=_scale_thread, args=(req.port, req.protocol), daemon=True)
    _scale["_thread"] = t
    t.start()
    time.sleep(0.3)   # dar tiempo al hilo para abrir el puerto
    if _scale.get("error"):
        raise HTTPException(503, _scale["error"])
    return {"ok": True}


@router.post("/scale/disconnect", summary="Desconecta balanza")
def disconnect_scale():
    _scale["connected"] = False
    if _scale.get("_serial"):
        try:
            _scale["_serial"].close()
        except Exception:
            pass
    _scale.update(weight=None, stable=False, error=None)
    return {"ok": True}


@router.get("/scale/weight", summary="Peso actual de la balanza")
def get_weight():
    if MOCK_MODE:
        # Simulación: peso senoidal estable para ver el widget en dev
        t = time.time()
        w = round(abs(1.250 + 0.080 * math.sin(t * 0.5)), 3)
        stable = abs(math.sin(t * 0.5)) < 0.98   # "inestable" en picos
        return {"weight": w, "stable": stable, "connected": True, "unit": "kg", "mock": True}
    return {
        "weight":    _scale["weight"],
        "stable":    _scale["stable"],
        "connected": _scale["connected"],
        "unit":      "kg",
        "error":     _scale.get("error"),
    }

# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints — Impresora ESC/POS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/printer/receipt", summary="Imprime recibo en impresora térmica")
def print_receipt(req: PrintReceiptIn):
    if MOCK_MODE:
        return {"ok": True, "mock": True, "message": "Recibo impreso (simulado)"}
    _escpos_receipt(req)
    return {"ok": True}


@router.post("/printer/test", summary="Página de prueba de impresora")
def print_test():
    if MOCK_MODE:
        return {"ok": True, "mock": True}
    try:
        from escpos.printer import Usb
        p = Usb(0x0416, 0x5011, timeout=0, in_ep=0x81, out_ep=0x03)
        p.set(align="center", bold=True)
        p.text("PYFIX POS — PRUEBA\n")
        p.text(datetime.now().strftime("%d/%m/%Y  %H:%M") + "\n")
        p.text("Impresora OK\n\n\n")
        p.cut()
        p.close()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(503, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints — Cajón de dinero
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/cash-drawer/open", summary="Abre cajón y registra en AuditLog")
def open_drawer(req: DrawerOpenIn, db: Session = Depends(get_db)):
    if not MOCK_MODE:
        _escpos_open_drawer()

    _audit(
        db,
        action    = "drawer.open",
        entity_id = req.sale_id or "manual",
        new_state = {"reason": req.reason, "sale_id": req.sale_id, "mock": MOCK_MODE},
        reason    = req.reason,
    )
    return {"ok": True, "mock": MOCK_MODE}

# ═══════════════════════════════════════════════════════════════════════════════
# Status general
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/status", summary="Estado de todos los periféricos")
def hardware_status():
    return {
        "mock_mode": MOCK_MODE,
        "scale": {
            "connected": _scale["connected"],
            "port":      _scale["port"],
            "protocol":  _scale["protocol"],
            "error":     _scale.get("error"),
        },
        "printer": {"note": "USB auto-detect en modo real"},
        "cash_drawer": {"note": "Vía impresora ESC/POS"},
    }
