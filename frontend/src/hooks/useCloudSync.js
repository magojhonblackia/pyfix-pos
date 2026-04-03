/**
 * useCloudSync — Gestiona la sincronización de datos con la nube.
 *
 * Uso:
 *   const { status, push, pull, pushing, pulling, lastPush, lastPull } = useCloudSync()
 *
 * El hook lee la licenseKey del localStorage automáticamente.
 * Se puede llamar a push() desde cualquier componente (p.ej. después de una venta)
 * para hacer backup automático silencioso.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { getSyncStatus, pushToCloud, pullFromCloud } from '@/services/syncApi.js'

const LS_LAST_PUSH = 'pyfix_last_cloud_push'
const LS_LAST_PULL = 'pyfix_last_cloud_pull'
const AUTO_PUSH_COOLDOWN_MS = 60_000  // 1 minuto mínimo entre auto-push

export function useCloudSync() {
  const [pushing,    setPushing]    = useState(false)
  const [pulling,    setPulling]    = useState(false)
  const [pushError,  setPushError]  = useState(null)
  const [pullError,  setPullError]  = useState(null)
  const [pushResult, setPushResult] = useState(null)  // { stats, pushed_at }
  const [pullResult, setPullResult] = useState(null)  // { imported, cloud_updated_at }
  const [syncStatus, setSyncStatus] = useState(null)  // stats locales

  // Últimos timestamps (localStorage para persistencia entre recargas)
  const [lastPush, setLastPush] = useState(() => localStorage.getItem(LS_LAST_PUSH) || null)
  const [lastPull, setLastPull] = useState(() => localStorage.getItem(LS_LAST_PULL) || null)

  const lastAutoPush = useRef(0)  // timestamp del último auto-push (para throttle)

  function getLicenseKey() {
    return localStorage.getItem('pyfix_license_key') || null
  }

  // ── Cargar estado al montar ────────────────────────────────
  const refreshStatus = useCallback(async () => {
    const res = await getSyncStatus()
    if (res.ok) {
      setSyncStatus(res.data)
      // Sincronizar timestamps si el backend tiene más recientes
      if (res.data.last_push && (!lastPush || res.data.last_push > lastPush)) {
        setLastPush(res.data.last_push)
        localStorage.setItem(LS_LAST_PUSH, res.data.last_push)
      }
      if (res.data.last_pull && (!lastPull || res.data.last_pull > lastPull)) {
        setLastPull(res.data.last_pull)
        localStorage.setItem(LS_LAST_PULL, res.data.last_pull)
      }
    }
  }, [lastPush, lastPull])

  useEffect(() => { refreshStatus() }, [])

  // ── Push manual (subir datos a la nube) ───────────────────
  const push = useCallback(async () => {
    const key = getLicenseKey()
    if (!key) return { ok: false, error: 'Sin licencia registrada' }

    setPushing(true)
    setPushError(null)
    setPushResult(null)

    const res = await pushToCloud(key)

    if (res.ok) {
      const now = res.data.pushed_at || new Date().toISOString()
      setLastPush(now)
      localStorage.setItem(LS_LAST_PUSH, now)
      setPushResult(res.data)
      lastAutoPush.current = Date.now()
      await refreshStatus()
    } else {
      setPushError(res.error)
    }

    setPushing(false)
    return res
  }, [refreshStatus])

  // ── Pull manual (restaurar datos desde la nube) ────────────
  const pull = useCallback(async () => {
    const key = getLicenseKey()
    if (!key) return { ok: false, error: 'Sin licencia registrada' }

    setPulling(true)
    setPullError(null)
    setPullResult(null)

    const res = await pullFromCloud(key)

    if (res.ok) {
      const now = res.data.pulled_at || new Date().toISOString()
      setLastPull(now)
      localStorage.setItem(LS_LAST_PULL, now)
      setPullResult(res.data)
      await refreshStatus()
    } else {
      setPullError(res.error)
    }

    setPulling(false)
    return res
  }, [refreshStatus])

  /**
   * Auto-push silencioso — llamar después de crear ventas/productos.
   * Aplica throttle (1 minuto entre llamadas) para no saturar el servidor.
   * No muestra errores al usuario si falla.
   */
  const autoPush = useCallback(async () => {
    const key = getLicenseKey()
    if (!key) return
    if (pushing || pulling) return

    const now = Date.now()
    if (now - lastAutoPush.current < AUTO_PUSH_COOLDOWN_MS) return

    lastAutoPush.current = now  // marcar antes de la llamada para evitar doble disparo
    const res = await pushToCloud(key)
    if (res.ok) {
      const ts = res.data.pushed_at || new Date().toISOString()
      setLastPush(ts)
      localStorage.setItem(LS_LAST_PUSH, ts)
    }
  }, [pushing, pulling])

  return {
    // Estado
    pushing, pulling,
    pushError, pullError,
    pushResult, pullResult,
    syncStatus,
    lastPush, lastPull,

    // Acciones
    push, pull, autoPush, refreshStatus,

    // Helper
    hasLicense: !!getLicenseKey(),
  }
}
