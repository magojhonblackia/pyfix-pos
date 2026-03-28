# PYFIX POS v1.0 — MVP

Sistema de punto de venta local. Funciona sin internet. Una venta en menos de 2 segundos.

---

## Requisitos

- Python 3.11 o superior
- Node.js 18 o superior
- pip (incluido con Python)

---

## Correr el backend

```bash
cd pyfix-pos/backend
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8765 --reload
```

El API queda disponible en: http://127.0.0.1:8765

Documentacion interactiva: http://127.0.0.1:8765/docs

---

## Correr el frontend

En otra terminal:

```bash
cd pyfix-pos/frontend
npm install
npm run dev
```

La UI queda disponible en: http://localhost:5173

---

## Correr con Electron (modo escritorio)

Con backend y frontend corriendo en sus terminales, abre una tercera terminal:

```bash
cd pyfix-pos/electron
npm install
npm start
```

Electron abre la ventana del POS. Al cerrar la ventana, el proceso Python se termina automaticamente.

---

## Primer producto y primera venta

### Crear un producto (via UI)

1. Abre http://localhost:5173/products
2. Completa el formulario: Nombre, Precio, Stock inicial
3. Haz click en "Guardar Producto"
4. El producto aparece en la tabla

### Crear un producto (via API)

```bash
curl -X POST http://127.0.0.1:8765/api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Gaseosa 350ml", "price": 2500, "cost_price": 1800, "stock": 50}'
```

### Hacer una venta (via UI)

1. Abre http://localhost:5173 (pagina POS)
2. Escribe el nombre del producto en el buscador
3. Haz click en el producto para agregarlo al carrito
4. Ajusta la cantidad con los botones + y -
5. Haz click en "COBRAR"
6. El mensaje de confirmacion muestra el ID de la venta y el total
7. El stock se descuenta automaticamente

### Hacer una venta (via API)

```bash
# Primero obtener el ID del producto
curl http://127.0.0.1:8765/api/products

# Luego crear la venta (reemplaza PRODUCT_ID con el id real)
curl -X POST http://127.0.0.1:8765/api/sales \
  -H "Content-Type: application/json" \
  -d '{"items": [{"product_id": "PRODUCT_ID", "quantity": 2}]}'
```

---

## Estructura de carpetas

```
pyfix-pos/
├── backend/                  Backend Python (FastAPI + SQLite)
│   ├── main.py               Punto de entrada FastAPI, CORS, startup
│   ├── database.py           Conexion SQLite con WAL mode y PRAGMAs de velocidad
│   ├── models/               Modelos SQLAlchemy (tablas)
│   │   ├── product.py        Tabla products
│   │   ├── sale.py           Tabla sales
│   │   └── sale_item.py      Tabla sale_items
│   ├── routers/              Endpoints REST
│   │   ├── products.py       GET/POST/PUT /api/products
│   │   └── sales.py          POST/GET /api/sales
│   ├── schemas/              Schemas Pydantic (validacion entrada/salida)
│   │   ├── product.py
│   │   └── sale.py
│   └── requirements.txt      Dependencias Python
│
├── frontend/                 UI React (Vite)
│   ├── index.html            HTML base
│   ├── vite.config.js        Config Vite, puerto 5173
│   ├── package.json
│   └── src/
│       ├── main.jsx          Punto de entrada React
│       ├── App.jsx           Router y navegacion
│       ├── components/       Componentes reutilizables
│       │   ├── ProductSearch.jsx   Buscador de productos con debounce
│       │   ├── Cart.jsx            Lista del carrito con +/-
│       │   ├── CheckoutButton.jsx  Boton cobrar
│       │   └── ProductForm.jsx     Formulario crear producto
│       ├── pages/
│       │   ├── POS.jsx       Pantalla principal de venta
│       │   └── Products.jsx  Gestion de productos
│       ├── services/
│       │   └── api.js        Llamadas al backend (fetch)
│       └── store/
│           └── cartStore.js  Estado del carrito (hook useState)
│
└── electron/                 App escritorio
    ├── main.js               Proceso principal: arranca Python, abre ventana
    └── package.json
```

---

## Endpoints disponibles

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | /api/products?q= | Lista productos activos, filtra por nombre o barcode |
| POST | /api/products | Crear producto |
| PUT | /api/products/{id} | Actualizar producto |
| POST | /api/sales | Crear venta (descuenta stock atomicamente) |
| GET | /api/sales?date=today | Ventas del dia |
| GET | /health | Estado del servidor |

---

## Base de datos

SQLite en `backend/pyfix_local.db`. Se crea automaticamente al iniciar el backend.

Configuracion de rendimiento aplicada:
- WAL mode: lecturas y escrituras simultaneas sin bloqueos
- cache_size 64MB: consultas frecuentes en memoria
- mmap 256MB: acceso directo a archivo sin syscalls
- synchronous=NORMAL: durabilidad sin fsync en cada escritura
- temp_store=MEMORY: tablas temporales en RAM
