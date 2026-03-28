/**
 * ScaleWidget — Muestra el peso de la balanza RS-232 en tiempo real.
 *
 * Props:
 *   onWeightAccepted(weight) — llamado cuando el cajero presiona "Aceptar"
 *                              o cuando llega un peso estable (si autoAccept=true).
 *   autoAccept — si true, acepta automáticamente cuando el peso es estable.
 */
import { useEffect } from 'react'
import { Scale, Power, PowerOff, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import { useScale } from '@/hooks/useScale.jsx'

export default function ScaleWidget({ onWeightAccepted, autoAccept = false }) {
  const { weight, stable, connected, unit, error, enabled, setEnabled } = useScale()

  // Auto-aceptar cuando el peso es estable (si la opción está activa)
  useEffect(() => {
    if (autoAccept && stable && weight !== null && weight > 0) {
      onWeightAccepted?.(weight)
    }
  }, [autoAccept, stable, weight, onWeightAccepted])

  const weightDisplay = weight !== null ? weight.toFixed(3) : '- - -'

  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">

      {/* Ícono + toggle */}
      <button
        onClick={() => setEnabled((v) => !v)}
        title={enabled ? 'Desactivar balanza' : 'Activar balanza'}
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors cursor-pointer ${
          enabled
            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
        }`}
      >
        {enabled ? <Power size={14} /> : <PowerOff size={14} />}
      </button>

      {/* Peso */}
      <div className="flex items-baseline gap-1 min-w-[90px]">
        {enabled && !connected && !error && (
          <Loader2 size={12} className="text-slate-400 animate-spin" />
        )}
        {enabled && error && (
          <AlertTriangle size={12} className="text-amber-500" />
        )}
        <span className={`font-mono text-base font-bold tabular-nums ${
          !enabled          ? 'text-slate-300' :
          error             ? 'text-amber-500' :
          stable && weight  ? 'text-green-700' :
          'text-slate-700'
        }`}>
          {enabled ? weightDisplay : '- - -'}
        </span>
        <span className="text-xs text-slate-400 font-semibold">{unit}</span>
      </div>

      {/* Indicador de estabilidad */}
      {enabled && weight !== null && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          stable
            ? 'bg-green-100 text-green-700'
            : 'bg-amber-100 text-amber-700 animate-pulse'
        }`}>
          {stable ? 'ESTABLE' : 'MIDIENDO'}
        </span>
      )}

      {/* Botón aceptar (cuando no es auto) */}
      {!autoAccept && enabled && stable && weight !== null && weight > 0 && (
        <button
          onClick={() => onWeightAccepted?.(weight)}
          className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
        >
          <CheckCircle2 size={12} /> Aceptar
        </button>
      )}
    </div>
  )
}
