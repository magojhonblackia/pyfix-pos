# PYFIX POS v3.0 — Plan de Implementación Técnica
> Generado: 2026-03-28 | Fuente: Análisis arquitectónico completo del codebase

---

## RESUMEN EJECUTIVO

Stack: FastAPI + SQLAlchemy 2.0 + SQLite (backend) · Vite + React 18 + TanStack Query + Zustand (frontend)

Estado actual: sistema funcionando para 1 PC, con permisos de usuario sin usar, user_id hardcodeado en ventas, y sin soporte multi-PC.

---

## BLOQUE 1 — BUGS CRÍTICOS (implementar primero, riesgo cero)

### BUG-01 · user_id hardcodeado en ventas (ALTA)
- **Problema**: `user_id=DEV_USER_ID` en `sales.py` línea 155 — todas las ventas se registran al mismo usuario ficticio
- **Fix**: Cambiar a `user_id=_u.id` (el usuario autenticado `_u` ya existe en la función)
- **Archivos**: `backend/routers/sales.py` líneas 155, 222, 224 (create_sale) · línea 273 (void_sale)
- **Archivos extra**: `backend/routers/products.py` línea 451 (adjust_stock) y StockMovement en create_product

### BUG-02 · Sin idempotencia en POST /sales (CRÍTICO — doble-click = venta duplicada)
- **Problema**: El frontend NO envía `idempotency_key`. El backend lo acepta pero nunca llega.
- **Fix frontend**: En `api.js`, agregar parámetro `idempotencyKey = null` a `createSale()` y enviarlo en el body como `idempotency_key`
- **Fix POS.jsx**: Agregar `const [saleKey, setSaleKey] = useState(() => crypto.randomUUID())` · pasarlo como 8vo arg a `createSale` · en `onSuccess` regenerar con `setSaleKey(crypto.randomUUID())`
- **Archivos**: `frontend/src/services/api.js` · `frontend/src/pages/POS.jsx`

### BUG-03 · int(float(qty)) trunca stock fraccional (ALTA)
- **Problema**: `_get_stock` en `products.py:28` retorna `int(float(inv.quantity))` → 2.5 kg se convierte en 2
- **Fix**: Cambiar a `Decimal(str(inv.quantity)) if inv else Decimal("0")` y ajustar tipo de retorno
- **Archivos**: `backend/routers/products.py` línea 28

---

## BLOQUE 2 — MULTI-PC / ACCESO DESDE VARIAS COMPUTADORAS (ALTA)

### MULTI-01 · Exponer backend en red local (cambio de 1 línea)
- **Problema**: `API_HOST` por defecto es `"127.0.0.1"` → solo acepta conexiones locales
- **Fix**: Cambiar default a `"0.0.0.0"` en `backend/config.py`
- **CORS**: Expandir `CORS_ORIGINS` para aceptar IPs de la LAN (ej. `http://192.168.1.*`)
- **Frontend**: Crear `frontend/.env.local` en cada PC cliente con `VITE_API_BASE=http://IP_SERVIDOR:8765/api`
- **Archivos**: `backend/config.py`

### MULTI-02 · Terminal ID por PC
- **Problema**: `DEV_TERMINAL_ID` hardcodeado = todas las PCs son el mismo terminal
- **Fix**: Leer `TERMINAL_ID` de variable de entorno en `constants.py` / `config.py`
- **Archivos**: `backend/config.py` o `backend/constants.py`

---

## BLOQUE 3 — SISTEMA DE PERMISOS GRANULARES (ALTA)

### Estado actual
- `User.permissions` existe en DB como campo `Text` (JSON array), **siempre `"[]"`**, nunca se usa
- `TokenResponse` NO incluye `permissions`
- `useAuth()` NO expone `permissions`
- `App.jsx:ROLE_ROUTES` hardcodea rutas por rol sin considerar permisos individuales
- `Users.jsx` modal no tiene checkboxes de permisos

### Rutas válidas (slugs de permiso = path de ruta)
```
/ · /pos · /products · /categories · /inventory · /sales
/customers · /suppliers · /purchases · /caja · /reports
/users · /hardware · /settings
```

### PERM-01 · Backend: schemas
- **Archivo**: `backend/schemas/auth.py`
- Agregar `import json` y `from pydantic import field_validator`
- `TokenResponse`: agregar campo `permissions: list[str] = []`
- `UserOut`: agregar `permissions: list[str] = []` + `@field_validator("permissions", mode="before")` que parsea JSON string → list
- `UserCreate`: agregar `permissions: list[str] = []`
- `UserUpdate`: agregar `permissions: Optional[list[str]] = None`
- **YA IMPLEMENTADO** ✅ (realizado en sesión anterior)

### PERM-02 · Backend: auth router — incluir permissions en login
- **Archivo**: `backend/routers/auth.py`
- En `login()`: parsear `json.loads(user.permissions or "[]")`
- Incluir en `create_access_token({"sub": ..., "role": ..., "business_id": ..., "permissions": perms})`
- Retornar `permissions=perms` en `TokenResponse`

### PERM-03 · Backend: users router — CRUD con permissions
- **Archivo**: `backend/routers/users.py`
- Definir lista `VALID_ROUTES` con las 14 rutas válidas
- `POST /users`: validar `data.permissions` contra `VALID_ROUTES`, guardar como `json.dumps(filtered)`
- `PATCH /users/{id}`: si `data.permissions is not None`, actualizar `user.permissions = json.dumps(filtered)`

### PERM-04 · Frontend: useAuth.jsx — exponer permissions
- **Archivo**: `frontend/src/hooks/useAuth.jsx`
- Agregar `permissions: tokenData.permissions ?? []` al objeto `userInfo`

### PERM-05 · Frontend: App.jsx — canAccess con permisos
- **Archivo**: `frontend/src/App.jsx`
- Cambiar firma: `canAccess(user, path)` (antes `canAccess(role, path)`)
- Lógica: `ROLE_ROUTES[user?.role]?.includes(path) || (user?.permissions ?? []).includes(path)`
- Actualizar `ProtectedRoute` para pasar `user` en lugar de `user?.role`
- Actualizar `AdminLayout.visibleNav` para filtrar con `canAccess(user, n.to)` en lugar de `n.roles.includes(user?.role)`
- Actualizar `AppShell`: cajero con permissions → mostrar `AdminLayout` en lugar de `CashierLayout`

### PERM-06 · Frontend: Users.jsx — checkboxes de permisos en modal
- **Archivo**: `frontend/src/pages/Users.jsx`
- Agregar estado `permissions: []` al form inicial
- Agregar componente `PermissionsEditor` dentro de `UserModal`:
  - Lista de checkboxes por cada ruta (label amigable + path)
  - Deshabilitado si role === 'admin' (siempre tiene todo)
  - Muestra nota: "Los permisos se suman a los del rol"
- Incluir `permissions` en payload de crear/actualizar usuario

---

## BLOQUE 4 — REPORTES FALTANTES (MEDIA)

### RPT-01 · Reporte de valor de inventario
- Nuevo endpoint `GET /api/inventory/value` → retorna `Σ(stock × cost_price)` por producto/categoría
- **Archivos**: `backend/routers/inventory.py` (nuevo endpoint)

### RPT-02 · Lista completa de stock bajo con export
- El endpoint `GET /api/products/low-stock` solo retorna `count`, no la lista completa
- Agregar respuesta con lista de productos para el tab de Reportes
- **Archivos**: `backend/routers/products.py`

### RPT-03 · Productos inactivos no se muestran
- `GET /api/products` filtra `is_active == 1` siempre → el botón "Inactivos" en Products.jsx nunca funciona
- Agregar query param `?include_inactive=true` al endpoint
- **Archivos**: `backend/routers/products.py`

---

## BLOQUE 5 — CORRECCIONES MENORES (BAJA)

### MIN-01 · StockMovement al editar producto directamente
- `update_product` sobreescribe `inv.quantity` sin crear registro `StockMovement` → audit trail incompleto
- **Archivos**: `backend/routers/products.py`

---

## ORDEN DE IMPLEMENTACIÓN RECOMENDADO

| # | Tarea | Archivos | Tiempo |
|---|-------|----------|--------|
| 1 | BUG-01: user_id en ventas | sales.py, products.py | 30 min |
| 2 | BUG-02: idempotency_key | api.js, POS.jsx | 30 min |
| 3 | BUG-03: Decimal en stock | products.py | 15 min |
| 4 | MULTI-01: 0.0.0.0 + CORS | config.py | 15 min |
| 5 | PERM-02: permissions en auth | routers/auth.py | 20 min |
| 6 | PERM-03: permissions en users CRUD | routers/users.py | 30 min |
| 7 | PERM-04: permissions en useAuth | useAuth.jsx | 10 min |
| 8 | PERM-05: canAccess actualizado | App.jsx | 20 min |
| 9 | PERM-06: checkboxes en Users.jsx | Users.jsx | 45 min |
| 10 | RPT-03: productos inactivos | products.py | 20 min |

---

## NOTAS TÉCNICAS PARA EL DEVELOPER

- `User.permissions` es `Text` en SQLite. Siempre usar `json.loads()` al leer y `json.dumps()` al escribir.
- `SQLiteDecimal` en `models/base.py` ya soporta PostgreSQL — la migración futura no romperá nada.
- El campo `business_id` ya está en el JWT como `DEV_BUSINESS_ID` — no cambiar aún, es tech debt aceptado.
- Los tests existentes en `test_auth.py` (si existen) deben pasar después de los cambios de auth.
- `schemas/auth.py` YA fue actualizado con `permissions` en `UserOut`, `TokenResponse`, `UserCreate`, `UserUpdate`.
