/**
 * Banner de estado de licencia — aparece en la parte superior del sidebar
 * Solo visible cuando el estado no es "active"
 */
import { useLicense } from '@/hooks/useLicense.jsx'
import { AlertTriangle, AlertCircle, XCircle, Clock } from 'lucide-react'

export default function TrialBanner() {
  const { status, daysRemaining, plan } = useLicense()

  if (status === 'active' || status === 'offline' || status === 'none') return null

  const configs = {
    trial: {
      icon:    <Clock size={13} />,
      bg:      'bg-blue-600/20 border-blue-500/30',
      text:    'text-blue-300',
      message: daysRemaining === 1
        ? '¡Último día de prueba!'
        : `Prueba gratis: ${daysRemaining} días`,
    },
    grace: {
      icon:    <AlertTriangle size={13} />,
      bg:      'bg-yellow-500/20 border-yellow-500/30',
      text:    'text-yellow-300',
      message: 'Licencia vencida — renueva ya',
    },
    degraded: {
      icon:    <AlertCircle size={13} />,
      bg:      'bg-orange-500/20 border-orange-500/30',
      text:    'text-orange-300',
      message: 'Reportes desactivados — renueva',
    },
    blocked: {
      icon:    <XCircle size={13} />,
      bg:      'bg-red-500/20 border-red-500/30',
      text:    'text-red-300',
      message: 'Solo efectivo — licencia bloqueada',
    },
  }

  const cfg = configs[status]
  if (!cfg) return null

  return (
    <div className={`mx-2 mb-1 px-3 py-2 rounded-lg border flex items-center gap-2 ${cfg.bg}`}>
      <span className={cfg.text}>{cfg.icon}</span>
      <span className={`text-[11px] font-semibold leading-tight ${cfg.text}`}>
        {cfg.message}
      </span>
    </div>
  )
}
