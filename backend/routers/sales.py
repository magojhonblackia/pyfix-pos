from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from database import get_db
from deps import get_current_user, require_role
from models.user import User
from models.product import Product, Category
from models.inventory import Inventory, StockMovement
from models.sale import Sale, SaleItem, Payment
from models.customer import Customer
from schemas.sale import SaleCreate, SaleResponse, VoidRequest
from constants import DEV_BUSINESS_ID, DEV_BRANCH_ID, DEV_TERMINAL_ID, DEV_USER_ID

router = APIRouter(prefix="/sales", tags=["sales"])

_COL = timezone(timedelta(hours=-5))   # Colombia UTC-5


def _get_customer_name(db: Session, customer_id: str | None) -> str | None:
    if not customer_id:
        return None
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    return c.name if c else None


def _batch_customer_names(db: Session, customer_ids: list[str]) -> dict[str, str]:
    """Devuelve {customer_id: name} para una lista de IDs."""
    if not customer_ids:
        return {}
    rows = db.query(Customer.id, Customer.name).filter(Customer.id.in_(customer_ids)).all()
    return {r.id: r.name for r in rows}

VALID_METHODS = {"cash", "card", "nequi", "daviplata"}


def _col_day_range(date_str: str):
    d     = datetime.strptime(date_str, "%Y-%m-%d")
    start = d.replace(hour=0,  minute=0,  second=0,  microsecond=0,      tzinfo=_COL)
    end   = d.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=_COL)
    return start, end


@router.post("", response_model=SaleResponse, status_code=201)
def create_sale(data: SaleCreate, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    if not data.items:
        raise HTTPException(400, "La venta debe tener al menos un item")

    # ── Idempotencia: rechazar duplicados ────────────────────
    if data.idempotency_key:
        existing = db.query(Sale).filter(
            Sale.idempotency_key == data.idempotency_key,
            Sale.business_id == DEV_BUSINESS_ID,
        ).first()
        if existing:
            cname = _get_customer_name(db, existing.customer_id)
            return SaleResponse.from_orm(existing, customer_name=cname)

    # ── Determinar método principal y validar pago ───────────
    if data.split_payments:
        if len(data.split_payments) < 2:
            raise HTTPException(400, "El pago dividido requiere al menos 2 métodos")
        for sp in data.split_payments:
            if sp.method.lower() not in VALID_METHODS:
                raise HTTPException(
                    400,
                    f"Método inválido: '{sp.method}'. Opciones: {', '.join(VALID_METHODS)}",
                )
        method = data.split_payments[0].method.lower()
    else:
        method = data.payment_method.lower()
        if method not in VALID_METHODS:
            raise HTTPException(400, f"Método de pago inválido. Opciones: {', '.join(VALID_METHODS)}")

    # 1. Validar productos y stock
    resolved = []
    for item_in in data.items:
        product = db.query(Product).filter(
            Product.id == item_in.product_id,
            Product.business_id == DEV_BUSINESS_ID,
            Product.is_active == 1,
            Product.deleted_at.is_(None),
        ).first()
        if not product:
            raise HTTPException(404, f"Producto {item_in.product_id} no encontrado o inactivo")

        inv = db.query(Inventory).filter(
            Inventory.product_id == item_in.product_id,
            Inventory.branch_id == DEV_BRANCH_ID,
        ).first()

        stock_ok = Decimal(str(inv.quantity)) if inv else Decimal("0")
        if stock_ok < Decimal(str(item_in.quantity)):
            raise HTTPException(
                400,
                f"Stock insuficiente para '{product.name}'. "
                f"Disponible: {stock_ok}, solicitado: {item_in.quantity}",
            )
        resolved.append((product, inv, item_in.quantity))

    # 2. Calcular totales
    subtotal = Decimal("0")
    items_data = []
    for (product, inv, qty), item_in in zip(resolved, data.items):
        # Usa precio override si fue enviado (p. ej. descuento por ítem desde frontend)
        if item_in.unit_price is not None and item_in.unit_price > 0:
            unit_price = Decimal(str(item_in.unit_price))
        else:
            unit_price = Decimal(str(product.price))
        quantity   = Decimal(str(qty))
        line_sub   = unit_price * quantity
        subtotal  += line_sub
        items_data.append({"product": product, "inv": inv, "quantity": quantity,
                           "unit_price": unit_price, "line_sub": line_sub})

    # 2b. Descuento global
    discount_pct   = max(0.0, min(100.0, float(data.discount_pct or 0)))
    discount_total = subtotal * Decimal(str(discount_pct)) / Decimal("100")
    total          = subtotal - discount_total

    # 3. Calcular cambio
    cash_tendered = Decimal("0")
    change_given  = Decimal("0")

    if data.split_payments:
        # Validar que la suma cubra el total
        split_sum = sum(Decimal(str(sp.amount)) for sp in data.split_payments)
        if split_sum < total:
            raise HTTPException(
                400,
                f"El monto dividido ({float(split_sum):,.0f}) es menor al total ({float(total):,.0f})",
            )
        # Cambio solo sobre la parte en efectivo
        non_cash      = sum(Decimal(str(sp.amount)) for sp in data.split_payments
                            if sp.method.lower() != "cash")
        cash_in       = sum(Decimal(str(sp.amount)) for sp in data.split_payments
                            if sp.method.lower() == "cash")
        cash_needed   = max(Decimal("0"), total - non_cash)
        change_given  = max(Decimal("0"), cash_in - cash_needed)
        cash_tendered = cash_in
    else:
        if method == "cash":
            tendered = data.cash_tendered if data.cash_tendered is not None else float(total)
            if Decimal(str(tendered)) < total:
                raise HTTPException(400, f"Monto recibido insuficiente. Total: {float(total):,.0f}")
            cash_tendered = Decimal(str(tendered))
            change_given  = cash_tendered - total

    # 4. Crear Sale
    sale = Sale(
        business_id=DEV_BUSINESS_ID,
        branch_id=DEV_BRANCH_ID,
        terminal_id=DEV_TERMINAL_ID,
        user_id=_u.id,
        customer_id=data.customer_id or None,
        subtotal=subtotal,
        discount_total=discount_total,
        tax_total=Decimal("0"),
        total=total,
        cash_tendered=cash_tendered,
        change_given=change_given,
        notes=data.notes or None,
        idempotency_key=data.idempotency_key or None,
    )
    db.add(sale)
    db.flush()

    # 5. Payment record(s)
    if data.split_payments:
        for sp in data.split_payments:
            db.add(Payment(
                sale_id=sale.id,
                business_id=DEV_BUSINESS_ID,
                method=sp.method.lower(),
                amount=Decimal(str(sp.amount)),
                status="approved",
            ))
    else:
        db.add(Payment(
            sale_id=sale.id,
            business_id=DEV_BUSINESS_ID,
            method=method,
            amount=total,
            status="approved",
        ))

    # 6. SaleItems + descontar stock + registrar movimientos
    for d in items_data:
        db.add(SaleItem(
            sale_id=sale.id,
            business_id=DEV_BUSINESS_ID,
            product_id=d["product"].id,
            product_name=d["product"].name,
            barcode=d["product"].barcode,
            quantity=d["quantity"],
            unit_price=d["unit_price"],
            cost_price=Decimal(str(d["product"].cost or 0)),
            tax_rate=d["product"].tax_rate,
            tax_amount=Decimal("0"),
            subtotal=d["line_sub"],
            total=d["line_sub"],
        ))
        qty_before = Decimal(str(d["inv"].quantity)) if d["inv"] else Decimal("0")
        if d["inv"]:
            d["inv"].quantity = qty_before - d["quantity"]
        else:
            db.add(Inventory(
                business_id=DEV_BUSINESS_ID,
                branch_id=DEV_BRANCH_ID,
                product_id=d["product"].id,
                quantity=Decimal("0") - d["quantity"],
            ))
        db.add(StockMovement(
            business_id=DEV_BUSINESS_ID,
            branch_id=DEV_BRANCH_ID,
            product_id=d["product"].id,
            quantity_delta=-d["quantity"],
            quantity_before=qty_before,
            quantity_after=qty_before - d["quantity"],
            reason="sale",
            sale_id=sale.id,
            user_id=_u.id,
        ))

    db.commit()
    db.refresh(sale)
    cname = _get_customer_name(db, sale.customer_id)
    return SaleResponse.from_orm(sale, customer_name=cname)


@router.post("/{sale_id}/void", response_model=SaleResponse)
def void_sale(sale_id: str, data: VoidRequest, db: Session = Depends(get_db), _u: User = Depends(require_role("admin", "supervisor"))):
    """Anular venta: marca como voided y devuelve el stock."""
    sale = db.query(Sale).filter(
        Sale.id == sale_id,
        Sale.business_id == DEV_BUSINESS_ID,
        Sale.deleted_at.is_(None),
    ).first()
    if not sale:
        raise HTTPException(404, "Venta no encontrada")
    if sale.status == "voided":
        raise HTTPException(400, "Esta venta ya fue anulada")

    # Restaurar inventario ítem por ítem + registrar movimiento
    for item in sale.items:
        if item.voided:
            continue
        inv = db.query(Inventory).filter(
            Inventory.product_id == item.product_id,
            Inventory.branch_id == DEV_BRANCH_ID,
        ).first()
        qty        = Decimal(str(item.quantity))
        qty_before = Decimal(str(inv.quantity)) if inv else Decimal("0")
        if inv:
            inv.quantity = qty_before + qty
        else:
            db.add(Inventory(
                business_id=DEV_BUSINESS_ID,
                branch_id=DEV_BRANCH_ID,
                product_id=item.product_id,
                quantity=qty,
            ))
        db.add(StockMovement(
            business_id=DEV_BUSINESS_ID,
            branch_id=DEV_BRANCH_ID,
            product_id=item.product_id,
            quantity_delta=qty,
            quantity_before=qty_before,
            quantity_after=qty_before + qty,
            reason="void_return",
            sale_id=sale_id,
            user_id=_u.id,
        ))

    sale.status = "voided"
    sale.notes  = data.reason
    db.commit()
    db.refresh(sale)
    cname = _get_customer_name(db, sale.customer_id)
    return SaleResponse.from_orm(sale, customer_name=cname)


@router.get("", response_model=list[SaleResponse])
def list_sales(
    date_from: str | None = None,
    date_to:   str | None = None,
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user),
):
    now_col = datetime.now(_COL)
    today   = now_col.strftime("%Y-%m-%d")
    from_s  = date_from or today
    to_s    = date_to   or from_s
    start, _ = _col_day_range(from_s)
    _, end   = _col_day_range(to_s)

    sales = (
        db.query(Sale)
        .filter(
            Sale.business_id == DEV_BUSINESS_ID,
            Sale.deleted_at.is_(None),
            Sale.created_at >= start,
            Sale.created_at <= end,
        )
        .order_by(Sale.created_at.desc())
        .limit(500)
        .all()
    )
    cids = list({s.customer_id for s in sales if s.customer_id})
    cmap = _batch_customer_names(db, cids)
    return [SaleResponse.from_orm(s, customer_name=cmap.get(s.customer_id)) for s in sales]


@router.get("/report", tags=["reports"])
def get_report(
    date_from: str | None = None,
    date_to:   str | None = None,
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user),
):
    """Reporte completo por rango de fechas: KPIs, por día, por método, top productos."""
    now_col = datetime.now(_COL)
    today   = now_col.strftime("%Y-%m-%d")
    from_s  = date_from or today
    to_s    = date_to   or from_s
    start, _ = _col_day_range(from_s)
    _, end   = _col_day_range(to_s)

    all_sales = (
        db.query(Sale)
        .filter(
            Sale.business_id == DEV_BUSINESS_ID,
            Sale.deleted_at.is_(None),
            Sale.created_at >= start,
            Sale.created_at <= end,
        )
        .all()
    )

    active = [s for s in all_sales if s.status != "voided"]
    voided = [s for s in all_sales if s.status == "voided"]

    sales_total    = sum(float(s.total)          for s in active)
    discount_total = sum(float(s.discount_total) for s in active)
    items_sold     = sum(int(float(i.quantity))  for s in active for i in s.items)
    avg_ticket     = sales_total / len(active) if active else 0.0

    # Ganancia estimada
    profit = 0.0
    for s in active:
        cost = sum(float(i.cost_price or 0) * float(i.quantity) for i in s.items)
        profit += float(s.total) - cost

    # Por método de pago
    method_map: dict[str, dict] = {}
    for s in active:
        for p in s.payments:
            m = p.method
            if m not in method_map:
                method_map[m] = {"method": m, "count": 0, "total": 0.0}
            method_map[m]["count"] += 1
            method_map[m]["total"] += float(p.amount)
    by_method = sorted(method_map.values(), key=lambda x: x["total"], reverse=True)

    # Por día (Colombia)
    from collections import defaultdict
    day_map: dict[str, dict] = defaultdict(lambda: {"count": 0, "total": 0.0, "profit": 0.0})
    for s in active:
        day = s.created_at.astimezone(_COL).strftime("%Y-%m-%d")
        cost = sum(float(i.cost_price or 0) * float(i.quantity) for i in s.items)
        day_map[day]["count"]  += 1
        day_map[day]["total"]  += float(s.total)
        day_map[day]["profit"] += float(s.total) - cost
    by_day = [{"date": d, **v} for d, v in sorted(day_map.items())]

    # Top productos + acumulado de costo por producto (en un solo paso)
    prod_map: dict[str, dict] = {}
    for s in active:
        for i in s.items:
            if i.product_id not in prod_map:
                prod_map[i.product_id] = {
                    "name": i.product_name, "qty": 0, "total": 0.0, "cost": 0.0,
                }
            prod_map[i.product_id]["qty"]   += int(float(i.quantity))
            prod_map[i.product_id]["total"] += float(i.subtotal)
            prod_map[i.product_id]["cost"]  += float(i.cost_price or 0) * float(i.quantity)
    top_products = sorted(prod_map.values(), key=lambda x: x["total"], reverse=True)[:10]

    # Margen por producto (top 15 por ganancia bruta)
    margin_products = []
    for info in prod_map.values():
        gross = info["total"] - info["cost"]
        pct   = (gross / info["total"] * 100) if info["total"] > 0 else 0.0
        margin_products.append({
            "name":       info["name"],
            "qty":        info["qty"],
            "total":      round(info["total"], 2),
            "cost":       round(info["cost"],  2),
            "profit":     round(gross, 2),
            "margin_pct": round(pct, 1),
        })
    margin_products.sort(key=lambda x: x["profit"], reverse=True)
    margin_products = margin_products[:15]

    # Desglose por categoría (lookup en batch desde DB)
    product_ids = list(prod_map.keys())
    cat_lookup: dict[str, str] = {}   # product_id → category_name
    if product_ids:
        prods = db.query(Product.id, Product.category_id).filter(
            Product.id.in_(product_ids)
        ).all()
        cat_ids = list({p.category_id for p in prods if p.category_id})
        cats = {c.id: c.name for c in db.query(Category).filter(
            Category.id.in_(cat_ids)
        ).all()} if cat_ids else {}
        for p in prods:
            cat_lookup[p.id] = cats.get(p.category_id, "Sin categoría") if p.category_id else "Sin categoría"

    cat_map: dict[str, dict] = {}
    for s in active:
        for i in s.items:
            cat = cat_lookup.get(i.product_id, "Sin categoría")
            if cat not in cat_map:
                cat_map[cat] = {"category": cat, "count": 0, "qty": 0, "total": 0.0, "profit": 0.0}
            cat_map[cat]["count"]  += 1
            cat_map[cat]["qty"]    += int(float(i.quantity))
            cat_map[cat]["total"]  += float(i.subtotal)
            cat_map[cat]["profit"] += float(i.subtotal) - float(i.cost_price or 0) * float(i.quantity)
    for c in cat_map.values():
        c["total"]  = round(c["total"],  2)
        c["profit"] = round(c["profit"], 2)
        c["margin_pct"] = round(c["profit"] / c["total"] * 100, 1) if c["total"] > 0 else 0.0
    by_category = sorted(cat_map.values(), key=lambda x: x["total"], reverse=True)

    return {
        "period_from":     from_s,
        "period_to":       to_s,
        "sales_count":     len(active),
        "sales_total":     round(sales_total,    2),
        "avg_ticket":      round(avg_ticket,     2),
        "items_sold":      items_sold,
        "discount_total":  round(discount_total, 2),
        "profit":          round(profit,         2),
        "voided_count":    len(voided),
        "by_method":       by_method,
        "by_day":          by_day,
        "top_products":    top_products,
        "margin_products": margin_products,
        "by_category":     by_category,
    }


def _week_range(offset_weeks: int = 0):
    """Devuelve (start, end) para la semana N relativa a la semana actual (Colombia).
    offset_weeks=0 → esta semana (lunes–hoy), -1 → semana anterior completa."""
    now_col           = datetime.now(_COL)
    days_since_monday = now_col.isoweekday() - 1            # 0 = Lun, 6 = Dom
    monday_this = (now_col - timedelta(days=days_since_monday)).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )
    target_monday = monday_this + timedelta(weeks=offset_weeks)
    if offset_weeks == 0:
        # Semana actual: lunes → ahora
        target_end = now_col
    else:
        # Semana pasada: lunes → domingo 23:59
        target_end = target_monday + timedelta(days=6, hours=23, minutes=59,
                                               seconds=59, microseconds=999999)
    return target_monday, target_end


def _week_totals(db: Session, start, end) -> dict:
    """Suma ventas activas en el rango dado."""
    rows = db.query(Sale).filter(
        Sale.business_id == DEV_BUSINESS_ID,
        Sale.deleted_at.is_(None),
        Sale.status  != "voided",
        Sale.created_at >= start,
        Sale.created_at <= end,
    ).all()
    return {
        "sales_count": len(rows),
        "sales_total": round(sum(float(s.total) for s in rows), 2),
        "profit":      round(sum(
            float(s.total) - sum(float(i.cost_price or 0) * float(i.quantity) for i in s.items)
            for s in rows
        ), 2),
    }


@router.get("/summary", tags=["dashboard"])
def get_summary(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Resumen del día para el Dashboard."""
    now_col  = datetime.now(_COL)
    today    = now_col.strftime("%Y-%m-%d")
    start, end = _col_day_range(today)

    sales = (
        db.query(Sale)
        .filter(
            Sale.business_id == DEV_BUSINESS_ID,
            Sale.deleted_at.is_(None),
            Sale.created_at >= start,
            Sale.created_at <= end,
        )
        .all()
    )

    active_sales = [s for s in sales if s.status != "voided"]

    # Top productos
    product_counts: dict[str, dict] = {}
    for sale in active_sales:
        for item in sale.items:
            pid = item.product_id
            if pid not in product_counts:
                product_counts[pid] = {"name": item.product_name, "qty": 0, "total": 0.0}
            product_counts[pid]["qty"]   += int(float(item.quantity))
            product_counts[pid]["total"] += float(item.subtotal)

    top_products = sorted(product_counts.values(), key=lambda x: x["qty"], reverse=True)[:5]

    # Actividad por hora (zona Colombia)
    hourly = [{"hour": h, "count": 0, "total": 0.0} for h in range(24)]
    for sale in active_sales:
        h = sale.created_at.astimezone(_COL).hour
        hourly[h]["count"] += 1
        hourly[h]["total"] += float(sale.total)

    # Ganancia bruta estimada = Σ(venta.total - costo_ítems)
    profit_today = 0.0
    for sale in active_sales:
        cost_of_sale = sum(
            float(item.cost_price or 0) * float(item.quantity)
            for item in sale.items
        )
        profit_today += float(sale.total) - cost_of_sale

    # Desglose por método de pago
    by_method: dict[str, float] = {}
    for sale in active_sales:
        method = sale.payments[0].method if sale.payments else "cash"
        by_method[method] = by_method.get(method, 0.0) + float(sale.total)

    # Últimas 8 ventas del día (activas + anuladas, más recientes primero)
    recent_raw = sorted(sales, key=lambda s: s.created_at, reverse=True)[:8]
    cids = list({s.customer_id for s in recent_raw if s.customer_id})
    cmap = _batch_customer_names(db, cids)
    recent_sales = [
        {
            "id":             s.id,
            "total":          float(s.total),
            "items_count":    sum(int(float(i.quantity)) for i in s.items),
            "payment_method": s.payments[0].method if s.payments else "cash",
            "status":         s.status,
            "customer_name":  cmap.get(s.customer_id),
            "created_at":     s.created_at.isoformat(),
        }
        for s in recent_raw
    ]

    # Comparativa semanal
    ws, we = _week_range(0)
    ps, pe = _week_range(-1)
    week_this = _week_totals(db, ws, we)
    week_prev = _week_totals(db, ps, pe)

    return {
        "sales_count":   len(active_sales),
        "sales_total":   sum(float(s.total) for s in active_sales),
        "items_sold":    sum(int(float(i.quantity)) for s in active_sales for i in s.items),
        "top_products":  top_products,
        "hourly":        hourly,
        "profit_today":  round(profit_today, 2),
        "by_method":     by_method,
        "recent_sales":  recent_sales,
        "date":          today,
        "week_this":     week_this,
        "week_prev":     week_prev,
    }


@router.get("/monthly-trend", tags=["reports"])
def monthly_trend(months: int = 12, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Tendencia de ventas y ganancia de los últimos N meses."""
    now_col = datetime.now(_COL)
    result  = []

    for offset in range(months - 1, -1, -1):
        # Calcular year/month del mes objetivo
        total_months = now_col.year * 12 + (now_col.month - 1) - offset
        year  = total_months // 12
        month = total_months % 12 + 1

        start = datetime(year, month, 1, tzinfo=_COL)
        end   = datetime(year + (month // 12), month % 12 + 1, 1, tzinfo=_COL)

        sales = db.query(Sale).filter(
            Sale.business_id == DEV_BUSINESS_ID,
            Sale.deleted_at.is_(None),
            Sale.status      != "voided",
            Sale.created_at  >= start,
            Sale.created_at  <  end,
        ).all()

        total  = round(sum(float(s.total) for s in sales), 2)
        profit = round(sum(
            float(s.total) - sum(float(i.cost_price or 0) * float(i.quantity) for i in s.items)
            for s in sales
        ), 2)

        result.append({
            "month":  f"{year:04d}-{month:02d}",
            "label":  start.strftime("%b %y"),
            "count":  len(sales),
            "total":  total,
            "profit": profit,
        })

    return result
