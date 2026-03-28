"""
Seed: 20 productos genéricos de minimarket colombiano.
Ejecutar con el backend corriendo:
  python seed_products.py
"""
import urllib.request
import urllib.error
import json

BASE = "http://127.0.0.1:8765/api/products"

PRODUCTS = [
    {"name": "Gaseosa Postobón 1.5L",        "price": 3500,  "cost_price": 2200,  "barcode": "7702004001001", "stock": 24},
    {"name": "Gaseosa Coca-Cola 350ml",       "price": 2500,  "cost_price": 1600,  "barcode": "7410222001002", "stock": 48},
    {"name": "Agua Cristal 600ml",            "price": 1500,  "cost_price": 800,   "barcode": "7702004002001", "stock": 60},
    {"name": "Agua Manantial 1.5L",           "price": 2000,  "cost_price": 1100,  "barcode": "7702004003001", "stock": 36},
    {"name": "Leche Alpina Entera 1L",        "price": 4200,  "cost_price": 2900,  "barcode": "7411500001001", "stock": 30},
    {"name": "Pan Tajado Bimbo 600g",         "price": 6500,  "cost_price": 4200,  "barcode": "7501030401001", "stock": 15},
    {"name": "Arroz Diana 1kg",               "price": 5000,  "cost_price": 3500,  "barcode": "7702049001001", "stock": 40},
    {"name": "Azúcar Manuelita 1kg",          "price": 4500,  "cost_price": 3000,  "barcode": "7702174001001", "stock": 25},
    {"name": "Aceite Premier 1L",             "price": 8500,  "cost_price": 6200,  "barcode": "7702114001001", "stock": 20},
    {"name": "Huevos Kikes x12",              "price": 12000, "cost_price": 8500,  "barcode": "7702650001001", "stock": 10},
    {"name": "Chocolate Jet x2 und",          "price": 2500,  "cost_price": 1500,  "barcode": "7622300001001", "stock": 50},
    {"name": "Galletas Oreo x6 und",          "price": 3000,  "cost_price": 1900,  "barcode": "7622210001001", "stock": 40},
    {"name": "Detergente Ariel 500g",         "price": 9500,  "cost_price": 6800,  "barcode": "4084500001001", "stock": 18},
    {"name": "Jabón de Lavar Rey x3",         "price": 6000,  "cost_price": 4000,  "barcode": "7702012001001", "stock": 22},
    {"name": "Papel Higiénico Familia x4",    "price": 8000,  "cost_price": 5500,  "barcode": "7702001001001", "stock": 16},
    {"name": "Shampoo H&S 200ml",             "price": 12500, "cost_price": 8900,  "barcode": "4015600001001", "stock": 12},
    {"name": "Cerveza Águila 330ml",          "price": 3000,  "cost_price": 1900,  "barcode": "7702099001001", "stock": 72},
    {"name": "Papas Margarita 50g",           "price": 2000,  "cost_price": 1200,  "barcode": "7702020001001", "stock": 35},
    {"name": "Chitos 50g",                    "price": 1800,  "cost_price": 1100,  "barcode": "7702060001001", "stock": 35},
    {"name": "Café Águila Roja Molido 250g",  "price": 7500,  "cost_price": 5200,  "barcode": "7702016001001", "stock": 20},
]


def post(product: dict) -> dict:
    body = json.dumps(product).encode()
    req = urllib.request.Request(
        BASE,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def main():
    ok = 0
    for p in PRODUCTS:
        try:
            result = post(p)
            print(f"  ✓ {result['name']}  —  ${result['price']:,}  (stock: {result['stock']})")
            ok += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"  ✗ {p['name']}  —  HTTP {e.code}: {body}")
        except Exception as e:
            print(f"  ✗ {p['name']}  —  {e}")

    print(f"\n{ok}/{len(PRODUCTS)} productos creados.")


if __name__ == "__main__":
    print("Insertando productos de prueba...\n")
    main()
