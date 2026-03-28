/**
 * useScale — Polling del peso de la balanza RS-232 (o mock en dev).
 *
 * Uso:
 *   const { weight, stable, connected, unit, enabled, setEnabled } = useScale()
 *
 * - `enabled` controla si el polling está activo (toggle desde UI).
 * - Poll cada 500 ms mientras enabled=true.
 * - En modo mock el backend retorna peso senoidal sin hardware físico.
 */
import { useState, useEffect, useCallback } from 'react'
import { getScaleWeight } from '@/services/api.js'

const POLL_INTERVAL = 500   // ms

export function useScale() {
  const [enabled,   setEnabled]   = useState(false)
  const [weight,    setWeight]    = useState(null)
  const [stable,    setStable]    = useState(false)
  const [connected, setConnected] = useState(false)
  const [unit,      setUnit]      = useState('kg')
  const [error,     setError]     = useState(null)

  const reset = useCallback(() => {
    setWeight(null)
    setStable(false)
    setConnected(false)
    setError(null)
  }, [])

  useEffect(() => {
    if (!enabled) {
      reset()
      return
    }

    let active = true

    const poll = async () => {
      try {
        const data = await getScaleWeight()
        if (!active) return
        setWeight(data.weight)
        setStable(data.stable ?? false)
        setConnected(data.connected ?? true)
        setUnit(data.unit ?? 'kg')
        setError(data.error ?? null)
      } catch (e) {
        if (!active) return
        setError(e.message)
        setConnected(false)
      }
    }

    poll()   // inmediato al activar
    const id = setInterval(poll, POLL_INTERVAL)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [enabled, reset])

  return { weight, stable, connected, unit, error, enabled, setEnabled }
}
