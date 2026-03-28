/**
 * Hook de gestión de licencias PYFIX
 *
 * Estados de licencia:
 *   active    → todo habilitado
 *   trial     → todo habilitado + banner de días restantes
 *   grace     → todo habilitado + banner urgente (1-7 días vencido)
 *   degraded  → sin reportes + banner (8-14 días vencido)
 *   blocked   → solo ventas en efectivo (15+ días vencido)
 *   offline   → sin conexión al servidor → funciona normal (tolerancia offline)
 *   none      → sin licencia registrada → mostrar pantalla de activación
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { validateLicense, activateLicense } from '@/services/licenseApi.js'

const LICENSE_KEY_STORAGE = 'pyfix_license_key'

const LicenseContext = createContext(null)

function loadStoredLicense() {
  return localStorage.getItem(LICENSE_KEY_STORAGE) || null
}

export function LicenseProvider({ children }) {
  const [licenseKey,    setLicenseKey]    = useState(loadStoredLicense)
  const [licenseStatus, setLicenseStatus] = useState(null)   // respuesta del servidor
  const [loading,       setLoading]       = useState(false)
  const [lastChecked,   setLastChecked]   = useState(null)

  // ── Activar en este dispositivo ──────────────────────────
  const activate = useCallback(async (key) => {
    setLoading(true)
    const trimmed = key.trim().toUpperCase()

    const result = await activateLicense(trimmed)
    if (!result.ok) {
      setLoading(false)
      return { ok: false, error: result.error }
    }

    // Validar para obtener el estado completo
    const validation = await validateLicense(trimmed)
    if (validation.ok) {
      localStorage.setItem(LICENSE_KEY_STORAGE, trimmed)
      setLicenseKey(trimmed)
      setLicenseStatus(validation.data)
      setLastChecked(Date.now())
    }

    setLoading(false)
    return { ok: true }
  }, [])

  // ── Validar licencia guardada al iniciar ─────────────────
  const checkLicense = useCallback(async () => {
    if (!licenseKey) return
    const result = await validateLicense(licenseKey)
    if (result.ok) {
      setLicenseStatus(result.data)
    } else {
      // Sin conexión → mantener último estado conocido (modo offline)
      setLicenseStatus(prev => prev ? { ...prev, _offline: true } : { status: 'offline', full_access: true, can_use_reports: true, can_use_all_payments: true })
    }
    setLastChecked(Date.now())
  }, [licenseKey])

  // Validar al montar y cada 4 horas
  useEffect(() => {
    checkLicense()
    const interval = setInterval(checkLicense, 4 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [checkLicense])

  const removeLicense = useCallback(() => {
    localStorage.removeItem(LICENSE_KEY_STORAGE)
    setLicenseKey(null)
    setLicenseStatus(null)
  }, [])

  // ── Permisos derivados del estado ────────────────────────
  const isActivated      = !!licenseKey
  const status           = licenseStatus?.status ?? 'none'
  const canUseReports    = licenseStatus?.can_use_reports    ?? true
  const canUseAllPayments = licenseStatus?.can_use_all_payments ?? true
  const fullAccess       = licenseStatus?.full_access        ?? true
  const daysRemaining    = licenseStatus?.days_remaining     ?? null
  const businessName     = licenseStatus?.business_name      ?? ''
  const plan             = licenseStatus?.plan               ?? 'trial'

  return (
    <LicenseContext.Provider value={{
      licenseKey, licenseStatus, loading, lastChecked,
      isActivated, status, canUseReports, canUseAllPayments,
      fullAccess, daysRemaining, businessName, plan,
      activate, checkLicense, removeLicense,
    }}>
      {children}
    </LicenseContext.Provider>
  )
}

export function useLicense() {
  const ctx = useContext(LicenseContext)
  if (!ctx) throw new Error('useLicense must be used inside <LicenseProvider>')
  return ctx
}
