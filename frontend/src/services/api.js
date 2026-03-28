const BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8765/api'

async function request(url, options = {}) {
  const token = localStorage.getItem('pyfix_token')
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  }
  const res  = await fetch(url, { ...options, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
  return data
}

// ── Productos ─────────────────────────────────────────────────
export const getProducts = (q = '') =>
  request(`${BASE}/products?q=${encodeURIComponent(q)}`)

export const getCategories = () =>
  request(`${BASE}/products/categories`)

export const createCategory = (name) =>
  request(`${BASE}/products/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const updateCategory = (id, name) =>
  request(`${BASE}/products/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const deleteCategory = (id) =>
  request(`${BASE}/products/categories/${id}`, { method: 'DELETE' })

export const createProduct = (data) =>
  request(`${BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const importProducts = (items) =>
  request(`${BASE}/products/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
  })

export const bulkPriceUpdate = (data) =>
  request(`${BASE}/products/bulk-price-update`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const updateProduct = (id, data) =>
  request(`${BASE}/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

/** Invierte is_active sin tocar el resto de campos */
export const toggleProductActive = (p) =>
  request(`${BASE}/products/${p.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name:       p.name,
      price:      p.price,
      cost_price: p.cost_price,
      barcode:    p.barcode,
      min_stock:  p.min_stock,
      is_active:  !p.is_active,
    }),
  })

// ── Ventas ────────────────────────────────────────────────────
export const createSale = (
  items,
  paymentMethod  = 'cash',
  cashTendered   = null,
  discountPct    = 0,
  notes          = null,
  customerId     = null,
  splitPayments  = null,
  idempotencyKey = null,
) =>
  request(`${BASE}/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items,
      payment_method:  paymentMethod,
      cash_tendered:   cashTendered,
      discount_pct:    discountPct,
      notes,
      customer_id:     customerId,
      split_payments:  splitPayments,
      idempotency_key: idempotencyKey,
    }),
  })

export const getSales = (dateFrom = null, dateTo = null) => {
  const p = new URLSearchParams()
  if (dateFrom) p.set('date_from', dateFrom)
  if (dateTo)   p.set('date_to',   dateTo)
  const qs = p.toString()
  return request(`${BASE}/sales${qs ? `?${qs}` : ''}`)
}

export const getSalesSummary = () =>
  request(`${BASE}/sales/summary`)

export const voidSale = (saleId, reason) =>
  request(`${BASE}/sales/${saleId}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })

// ── Inventario ────────────────────────────────────────────────
export const getAllProducts = () =>
  request(`${BASE}/products/all`)

export const getLowStockProducts = () =>
  request(`${BASE}/products/low-stock`)

export const getProductMovements = (productId, limit = 50) =>
  request(`${BASE}/products/${productId}/movements?limit=${limit}`)

export const adjustStock = (productId, delta, reason = 'adjustment', notes = null, batchData = {}) =>
  request(`${BASE}/products/${productId}/stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta, reason, notes, ...batchData }),
  })

export const getExpiringBatches = (days = 30) =>
  request(`${BASE}/inventory/batches/expiring?days=${days}`)

export const getProductBatches = (productId) =>
  request(`${BASE}/inventory/batches?product_id=${productId}`)

// ── Proveedores ───────────────────────────────────────────────
export const getSuppliers = () =>
  request(`${BASE}/suppliers`)

export const createSupplier = (data) =>
  request(`${BASE}/suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const updateSupplier = (id, data) =>
  request(`${BASE}/suppliers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteSupplier = (id) =>
  request(`${BASE}/suppliers/${id}`, { method: 'DELETE' })

// ── Turno de caja ─────────────────────────────────────────────
export const getCurrentRegister = () =>
  request(`${BASE}/cash-registers/current`)

export const openRegister = (opening_amount) =>
  request(`${BASE}/cash-registers/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opening_amount }),
  })

export const closeRegister = (closing_amount) =>
  request(`${BASE}/cash-registers/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ closing_amount }),
  })

export const getRegisterHistory = () =>
  request(`${BASE}/cash-registers/history`)

export const addExpense = (amount, category, description) =>
  request(`${BASE}/cash-registers/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, category, description }),
  })

export const getShiftExpenses = () =>
  request(`${BASE}/cash-registers/expenses`)

// ── Clientes ──────────────────────────────────────────────────
export const getCustomers = (q = '') =>
  request(`${BASE}/customers?q=${encodeURIComponent(q)}`)

export const createCustomer = (data) =>
  request(`${BASE}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const updateCustomer = (id, data) =>
  request(`${BASE}/customers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteCustomer = (id) =>
  request(`${BASE}/customers/${id}`, { method: 'DELETE' })

export const getCustomerPurchases = (id) =>
  request(`${BASE}/customers/${id}/purchases`)

// ── Órdenes de compra ─────────────────────────────────────────
export const getPurchaseOrders = () =>
  request(`${BASE}/purchase-orders`)

export const createPurchaseOrder = (data) =>
  request(`${BASE}/purchase-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const receivePurchaseOrder = (id) =>
  request(`${BASE}/purchase-orders/${id}/receive`, { method: 'POST' })

export const cancelPurchaseOrder = (id) =>
  request(`${BASE}/purchase-orders/${id}`, { method: 'DELETE' })

// ── Hardware ──────────────────────────────────────────────────
export const getHardwareStatus  = () => request(`${BASE}/hardware/status`)
export const getScalePorts      = () => request(`${BASE}/hardware/scale/ports`)
export const connectScale       = (port, protocol = 'cas') =>
  request(`${BASE}/hardware/scale/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port, protocol }),
  })
export const disconnectScale    = () =>
  request(`${BASE}/hardware/scale/disconnect`, { method: 'POST' })
export const getScaleWeight     = () => request(`${BASE}/hardware/scale/weight`)

export const printReceipt = (payload) =>
  request(`${BASE}/hardware/printer/receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
export const printerTest  = () =>
  request(`${BASE}/hardware/printer/test`, { method: 'POST' })

export const openCashDrawer = (saleId = null, reason = 'sale') =>
  request(`${BASE}/hardware/cash-drawer/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sale_id: saleId, reason }),
  })

// ── Usuarios ──────────────────────────────────────────────────
export const getUsers = () =>
  request(`${BASE}/users`)

export const createUser = (data) =>
  request(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const updateUser = (id, data) =>
  request(`${BASE}/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteUser = (id) =>
  request(`${BASE}/users/${id}`, { method: 'DELETE' })

// ── Reportes ──────────────────────────────────────────────────
export const getSalesReport = (dateFrom = null, dateTo = null) => {
  const p = new URLSearchParams()
  if (dateFrom) p.set('date_from', dateFrom)
  if (dateTo)   p.set('date_to',   dateTo)
  const qs = p.toString()
  return request(`${BASE}/sales/report${qs ? `?${qs}` : ''}`)
}

export const getMonthlyTrend = (months = 12) =>
  request(`${BASE}/sales/monthly-trend?months=${months}`)

// ── Configuración ─────────────────────────────────────────────
export const getSettings = () =>
  request(`${BASE}/settings`)

export const saveSettings = (data) =>
  request(`${BASE}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
