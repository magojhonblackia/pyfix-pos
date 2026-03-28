import { useState, useEffect, useCallback } from 'react'
import { getSettings, saveSettings } from '@/services/api.js'

export const DEFAULT_SETTINGS = {
  businessName:      'Minimarket',
  nit:               '000000000-0',
  address:           '',
  phone:             '',
  receiptFooter:     '¡Gracias por su compra!',
  minStockThreshold: 5,
}

const LS_KEY = 'pyfix_settings'

/** Lee la caché local (fallback mientras llega la API o si no hay red). */
function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Escribe la caché local para que otros componentes tengan acceso síncrono. */
function writeCache(settings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)) } catch { /* noop */ }
}

// ── Hook principal ────────────────────────────────────────────

export function useSettings() {
  const [settings, setSettings] = useState(readCache)   // arranca con caché local
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  // Cargar desde la API al montar
  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((remote) => {
        if (cancelled) return
        const merged = { ...DEFAULT_SETTINGS, ...remote }
        setSettings(merged)
        writeCache(merged)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message)
        // Sin red → seguimos con la caché local, no bloqueamos la UI
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const save = useCallback(async (updates) => {
    const next = { ...settings, ...updates }
    // Optimistic update: actualizar UI y caché local de inmediato
    setSettings(next)
    writeCache(next)
    // Persistir en backend
    await saveSettings(updates)
  }, [settings])

  return { settings, save, loading, error }
}

/** Leer settings sin hook — devuelve la caché local (síncrono, sin red). */
export function readSettings() {
  return readCache()
}
