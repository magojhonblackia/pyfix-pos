/**
 * Cliente del servidor de licencias PYFIX
 * Separado del api.js principal para mantener independencia
 */
const LICENSE_SERVER = import.meta.env.VITE_LICENSE_SERVER ?? 'https://minimarket-production-d94f.up.railway.app'

async function licenseRequest(path, options = {}) {
  try {
    const res  = await fetch(`${LICENSE_SERVER}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
    return { ok: true, data }
  } catch (err) {
    // Si el servidor no responde → modo offline, no bloquear
    return { ok: false, error: err.message }
  }
}

/** Genera o recupera el ID único de este dispositivo */
export function getDeviceId() {
  const KEY = 'pyfix_device_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}

/** Valida la licencia contra el servidor */
export async function validateLicense(licenseKey) {
  return licenseRequest('/license/validate', {
    method: 'POST',
    body: JSON.stringify({
      license_key: licenseKey,
      hardware_id: getDeviceId(),
      hostname:    window.location.hostname,
    }),
  })
}

/** Activa este dispositivo con la licencia */
export async function activateLicense(licenseKey) {
  return licenseRequest('/license/activate', {
    method: 'POST',
    body: JSON.stringify({
      license_key: licenseKey,
      hardware_id: getDeviceId(),
      hostname:    window.location.hostname,
    }),
  })
}
