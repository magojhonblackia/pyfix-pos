import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

// ── context ──────────────────────────────────────────────────
const ToastCtx = createContext(() => {})

// ── estilos por tipo ──────────────────────────────────────────
const STYLES = {
  success: { wrap: 'border-green-200 bg-green-50',   text: 'text-green-800',  Icon: CheckCircle,  ic: 'text-green-500'  },
  error:   { wrap: 'border-red-200   bg-red-50',     text: 'text-red-800',    Icon: XCircle,      ic: 'text-red-500'    },
  warning: { wrap: 'border-amber-200 bg-amber-50',   text: 'text-amber-800',  Icon: AlertTriangle,ic: 'text-amber-500'  },
  info:    { wrap: 'border-blue-200  bg-blue-50',    text: 'text-blue-800',   Icon: Info,         ic: 'text-blue-500'   },
}

// ── proveedor ─────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const toast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastCtx.Provider value={toast}>
      {children}

      {/* Stack flotante — bottom-right */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map(({ id, message, type }) => {
          const s = STYLES[type] ?? STYLES.info
          return (
            <div
              key={id}
              className={`pointer-events-auto flex items-start gap-2.5 border rounded-xl px-4 py-3 shadow-xl min-w-[220px] max-w-[320px] ${s.wrap}`}
            >
              <s.Icon size={15} className={`${s.ic} shrink-0 mt-0.5`} />
              <span className={`text-sm font-semibold flex-1 leading-snug ${s.text}`}>
                {message}
              </span>
              <button
                onClick={() => dismiss(id)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0 mt-0.5"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

/** useToast() → fn(message, type?, duration?) */
export const useToast = () => useContext(ToastCtx)
