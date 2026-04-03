/**
 * syncApi.js — Cliente de sincronización en la nube PYFIX POS
 *
 * Todos los endpoints apuntan al backend LOCAL (127.0.0.1:8765/api/sync/*)
 * que a su vez se comunica con el servidor Railway para guardar/traer datos.
 */
const API = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8765/api'

function authHeaders() {
  const token = localStorage.getItem('pyfix_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function call(path, options = {}) {
  try {
    const res  = await fetch(`${API}${path}`, { ...options, headers: authHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/** Estado de sincronización: stats locales + fechas de último push/pull */
export async function getSyncStatus() {
  return call('/sync/status')
}

/**
 * Sube todos los datos locales a la nube.
 * @param {string} licenseKey  Clave de licencia del negocio (localStorage pyfix_license_key)
 * @param {string} [deviceId]  ID del dispositivo (localStorage pyfix_device_id)
 */
export async function pushToCloud(licenseKey, deviceId = null) {
  const device_id = deviceId || localStorage.getItem('pyfix_device_id') || 'local'
  return call('/sync/push', {
    method: 'POST',
    body:   JSON.stringify({ license_key: licenseKey, device_id }),
  })
}

/**
 * Descarga los datos de la nube e importa en el SQLite local.
 * @param {string} licenseKey  Clave de licencia del negocio
 */
export async function pullFromCloud(licenseKey) {
  return call('/sync/pull', {
    method: 'POST',
    body:   JSON.stringify({ license_key: licenseKey }),
  })
}
