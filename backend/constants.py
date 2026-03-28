"""
Constantes de desarrollo — IDs fijos para modo dev sin auth.
En producción estos vienen del JWT + hardware_id binding.

TERMINAL_ID: cada PC debe configurar esta variable de entorno con un UUID único.
Si no se define, usa el valor por defecto (apto para instalación de un solo PC).
Generar un UUID nuevo: python -c "import uuid; print(uuid.uuid4())"
"""
import os

DEV_BUSINESS_ID = "00000000-0000-7000-8000-000000000001"
DEV_BRANCH_ID   = "00000000-0000-7000-8000-000000000002"
DEV_TERMINAL_ID = os.getenv("TERMINAL_ID", "00000000-0000-7000-8000-000000000003")
DEV_USER_ID     = "00000000-0000-7000-8000-000000000004"

# Categorías predefinidas para desarrollo
DEV_CATEGORY_IDS: dict[str, str] = {
    "General":   "00000000-0000-7000-8000-000000000010",
    "Bebidas":   "00000000-0000-7000-8000-000000000011",
    "Lácteos":   "00000000-0000-7000-8000-000000000012",
    "Carnes":    "00000000-0000-7000-8000-000000000013",
    "Panadería": "00000000-0000-7000-8000-000000000014",
    "Aseo":      "00000000-0000-7000-8000-000000000015",
    "Snacks":    "00000000-0000-7000-8000-000000000016",
    "Enlatados": "00000000-0000-7000-8000-000000000017",
    "Frutas":    "00000000-0000-7000-8000-000000000018",
    "Granos":    "00000000-0000-7000-8000-000000000019",
}
