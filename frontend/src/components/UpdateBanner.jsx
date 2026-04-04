/**
 * UpdateBanner — Notificación de actualización disponible
 *
 * Aparece en la barra lateral cuando hay una versión más nueva publicada
 * en GitHub Releases. Solo visible para administradores.
 *
 * Flujo:
 *  1. Al montar: GET /api/system/check-update
 *  2. Si hay update: muestra banner con botón "Actualizar ahora"
 *  3. Al hacer click: POST /api/system/apply-update → descarga + ejecuta instalador
 *  4. El instalador (en segundo plano) reemplaza los archivos y reinicia el sistema
 */
import { useState, useEffect, useCallback } from 'react'
import { Download, X, RefreshCw, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'

const API = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8765/api'

function authHeaders() {
  const token = localStorage.getItem('pyfix_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ── Estado interno de la actualización ───────────────────────
// 'idle' | 'checking' | 'available' | 'downloading' | 'done' | 'error' | 'dismissed'
export default function UpdateBanner() {
  const [state,          setState]          = useState('idle')
  const [updateInfo,     setUpdateInfo]     = useState(null)  // { latest_version, installer_url, ... }
  const [errorMsg,       setErrorMsg]       = useState('')
  const [dismissed,      setDismissed]      = useState(() => {
    // No volver a mostrar si el usuario lo descartó para esta versión
    return localStorage.getItem('pyfix_update_dismissed') || ''
  })

  const checkUpdate = useCallback(async () => {
    setState('checking')
    try {
      const res  = await fetch(`${API}/system/check-update`, { headers: authHeaders() })
      const data = await res.json()

      if (!res.ok || data.error) {
        // Error silencioso — no interrumpir el trabajo del usuario
        setState('idle')
        return
      }

      if (data.update_available && data.installer_url) {
        // Si ya descartó esta versión, no volver a molestar
        if (dismissed === data.latest_version) {
          setState('dismissed')
          return
        }
        setUpdateInfo(data)
        setState('available')
      } else {
        setState('idle')
      }
    } catch {
      setState('idle')  // sin conexión — silencioso
    }
  }, [dismissed])

  // Chequear al montar y luego cada 6 horas
  useEffect(() => {
    const timer = setTimeout(checkUpdate, 5000)  // 5s de retraso para no bloquear el inicio
    const interval = setInterval(checkUpdate, 6 * 60 * 60 * 1000)
    return () => { clearTimeout(timer); clearInterval(interval) }
  }, [checkUpdate])

  const handleUpdate = async () => {
    if (!updateInfo?.installer_url) return
    setState('downloading')
    try {
      const res  = await fetch(`${API}/system/apply-update`, {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({ installer_url: updateInfo.installer_url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error iniciando actualización')
      setState('done')
    } catch (e) {
      setErrorMsg(e.message)
      setState('error')
    }
  }

  const handleDismiss = () => {
    if (updateInfo?.latest_version) {
      localStorage.setItem('pyfix_update_dismissed', updateInfo.latest_version)
      setDismissed(updateInfo.latest_version)
    }
    setState('dismissed')
  }

  // Solo renderizar si hay algo que mostrar
  if (!['available', 'downloading', 'done', 'error'].includes(state)) return null

  // ── Variantes visuales por estado ─────────────────────────
  if (state === 'done') {
    return (
      <div className="mx-2 mb-2 p-3 rounded-lg bg-green-900/40 border border-green-700/50 text-green-300">
        <div className="flex items-center gap-2 text-xs font-bold">
          <CheckCircle2 size={13} />
          Actualización en progreso
        </div>
        <p className="text-[11px] mt-1 text-green-400 leading-snug">
          El instalador se ejecutará en breve. Guarda tu trabajo y espera.
        </p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="mx-2 mb-2 p-3 rounded-lg bg-red-900/40 border border-red-700/50 text-red-300">
        <div className="flex items-center gap-2 text-xs font-bold">
          <AlertTriangle size={13} />
          Error al actualizar
        </div>
        <p className="text-[11px] mt-1 text-red-400 leading-snug">{errorMsg}</p>
        <button
          onClick={() => setState('available')}
          className="mt-2 text-[11px] text-red-300 underline cursor-pointer hover:text-white"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="mx-2 mb-2 p-3 rounded-lg bg-blue-900/50 border border-blue-600/50">
      {/* Cabecera */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-blue-300 text-[11px] font-bold uppercase tracking-wider">
          <RefreshCw size={11} />
          Actualización disponible
        </div>
        <button
          onClick={handleDismiss}
          className="text-slate-500 hover:text-slate-300 cursor-pointer p-0.5"
          title="Ignorar esta versión"
        >
          <X size={12} />
        </button>
      </div>

      {/* Info de versión */}
      <p className="text-[11px] text-slate-300 leading-snug mb-2">
        <span className="font-semibold text-white">v{updateInfo?.latest_version}</span>
        {' '}está disponible
        {updateInfo?.current_version && (
          <span className="text-slate-500"> (instalada: v{updateInfo.current_version})</span>
        )}
      </p>

      {/* Notas de release (primeras 120 chars) */}
      {updateInfo?.release_notes && (
        <p className="text-[10px] text-slate-400 leading-snug mb-2 line-clamp-2">
          {updateInfo.release_notes.replace(/[#*`]/g, '').slice(0, 120)}…
        </p>
      )}

      {/* Botón actualizar */}
      <button
        onClick={handleUpdate}
        disabled={state === 'downloading'}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === 'downloading'
          ? <><Loader2 size={12} className="animate-spin" /> Descargando…</>
          : <><Download size={12} /> Actualizar ahora</>}
      </button>

      {state === 'downloading' && (
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">
          Descargando en segundo plano, no cierres la app.
        </p>
      )}
    </div>
  )
}
