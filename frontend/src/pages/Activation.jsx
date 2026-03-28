/**
 * Pantalla de activación — se muestra la primera vez que se instala PYFIX
 * El tendero ingresa su license_key para registrar este dispositivo.
 */
import { useState } from 'react'
import { useLicense } from '@/hooks/useLicense.jsx'
import { KeyRound, Loader2, ShieldCheck, AlertCircle } from 'lucide-react'

export default function Activation() {
  const { activate, loading } = useLicense()
  const [key,     setKey]     = useState('')
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!key.trim()) return setError('Ingresa tu clave de licencia')

    const result = await activate(key)
    if (!result.ok) {
      setError(result.error || 'No se pudo activar la licencia. Verifica la clave e intenta de nuevo.')
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <ShieldCheck size={56} className="mx-auto text-green-400" />
          <h2 className="text-white text-2xl font-bold">¡Activación exitosa!</h2>
          <p className="text-slate-400">Tu licencia está activa. Cargando PYFIX POS...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-white font-extrabold text-3xl tracking-tight">PYFIX POS</h1>
          <p className="text-slate-500 text-sm mt-1">Sistema de Punto de Venta</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6">
          <div className="text-center">
            <KeyRound size={36} className="mx-auto text-blue-400 mb-3" />
            <h2 className="text-white font-bold text-xl">Activa tu licencia</h2>
            <p className="text-slate-400 text-sm mt-1">
              Ingresa la clave que recibiste al registrarte
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Clave de licencia
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="PYFIX-XXXX-XXXX-XXXX"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-sm font-mono tracking-widest placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 size={18} className="animate-spin" /> Activando...</>
                : 'Activar PYFIX en este PC'
              }
            </button>
          </form>

          <p className="text-center text-slate-600 text-xs">
            ¿No tienes una licencia?{' '}
            <a
              href="https://pyfix.app/registro"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300"
            >
              Regístrate gratis — 30 días de prueba
            </a>
          </p>
        </div>

      </div>
    </div>
  )
}
