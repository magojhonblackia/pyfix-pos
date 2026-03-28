/**
 * Hardware.jsx — Configuración y prueba de periféricos
 * - Balanza RS-232 (CAS / Toledo / Mettler / Generic)
 * - Impresora térmica ESC/POS
 * - Cajón de dinero
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getHardwareStatus, getScalePorts, connectScale, disconnectScale, getScaleWeight,
  printerTest, openCashDrawer,
} from '@/services/api.js'
import { useScale }  from '@/hooks/useScale.jsx'
import { useToast }  from '@/components/Toast.jsx'
import {
  Scale, Printer, Vault, Power, PowerOff, RefreshCw, CheckCircle2,
  Loader2, AlertTriangle, Wifi, WifiOff, Cpu,
} from 'lucide-react'

// ── Layout helpers ─────────────────────────────────────────────
function Card({ icon, title, badge, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <span className="text-slate-400">{icon}</span>
          {title}
        </h3>
        {badge}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function StatusPill({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
      ok ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
    }`}>
      {ok ? <CheckCircle2 size={11}/> : <WifiOff size={11}/>} {label}
    </span>
  )
}

const INPUT = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition'
const BTN   = 'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer'
const BTN_P = `${BTN} bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed`
const BTN_S = `${BTN} border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed`
const BTN_R = `${BTN} border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed`

// ══════════════════════════════════════════════════════════════════════════════
export default function Hardware() {
  const toast = useToast()
  const qc    = useQueryClient()

  const { data: status, isLoading: loadingStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['hw-status'],
    queryFn:  getHardwareStatus,
    staleTime: 5_000,
    refetchInterval: 10_000,
  })

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-2xl mx-auto p-6 space-y-5">

        {/* Encabezado */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
              <Cpu size={20} className="text-blue-500" />
              Hardware
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">Periféricos de punto de venta</p>
          </div>
          <div className="flex items-center gap-2">
            {status?.mock_mode && (
              <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-200">
                MOCK MODE
              </span>
            )}
            <button
              onClick={() => refetchStatus()}
              disabled={loadingStatus}
              className={BTN_S}
            >
              <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Balanza */}
        <ScaleCard status={status?.scale} toast={toast} />

        {/* Impresora */}
        <PrinterCard toast={toast} />

        {/* Cajón */}
        <DrawerCard toast={toast} />

      </div>
    </div>
  )
}

// ── Balanza ────────────────────────────────────────────────────
function ScaleCard({ status, toast }) {
  const [port,     setPort]     = useState('')
  const [protocol, setProtocol] = useState('cas')
  const { weight, stable, connected: liveConn, unit, error: liveErr, enabled, setEnabled } = useScale()

  const { data: portsData, isLoading: loadingPorts, refetch: refetchPorts } = useQuery({
    queryKey: ['hw-scale-ports'],
    queryFn:  getScalePorts,
    staleTime: 30_000,
  })

  const connectMut = useMutation({
    mutationFn: () => connectScale(port, protocol),
    onSuccess: () => { toast('Balanza conectada', 'success'); setEnabled(true) },
    onError: (e) => toast(e.message, 'error'),
  })

  const disconnectMut = useMutation({
    mutationFn: disconnectScale,
    onSuccess: () => { toast('Balanza desconectada', 'info'); setEnabled(false) },
    onError: (e) => toast(e.message, 'error'),
  })

  const ports = portsData?.ports ?? []
  const isConnected = status?.connected ?? false

  return (
    <Card
      icon={<Scale size={15}/>}
      title="Balanza RS-232"
      badge={<StatusPill ok={isConnected} label={isConnected ? 'Conectada' : 'Desconectada'} />}
    >
      {/* Configuración de puerto */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Puerto serial</label>
          <div className="flex gap-1">
            <select
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className={INPUT}
              disabled={isConnected}
            >
              <option value="">— Seleccionar puerto —</option>
              {ports.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button
              onClick={() => refetchPorts()}
              disabled={loadingPorts}
              title="Escanear puertos"
              className="px-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 cursor-pointer shrink-0"
            >
              <RefreshCw size={13} className={loadingPorts ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Protocolo</label>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            className={INPUT}
            disabled={isConnected}
          >
            <option value="cas">CAS (LP/CI)</option>
            <option value="toledo">Toledo (8142/8217)</option>
            <option value="mettler">Mettler MT-SICS</option>
            <option value="generic">Genérico (autodetect)</option>
          </select>
        </div>
      </div>

      {/* Botones connect / disconnect */}
      <div className="flex gap-2">
        {!isConnected ? (
          <button
            onClick={() => connectMut.mutate()}
            disabled={!port || connectMut.isPending}
            className={BTN_P}
          >
            {connectMut.isPending
              ? <><Loader2 size={14} className="animate-spin"/> Conectando...</>
              : <><Power size={14}/> Conectar</>
            }
          </button>
        ) : (
          <button
            onClick={() => disconnectMut.mutate()}
            disabled={disconnectMut.isPending}
            className={BTN_R}
          >
            <PowerOff size={14}/> Desconectar
          </button>
        )}
      </div>

      {/* Peso en vivo */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lectura en vivo</span>
          <button
            onClick={() => setEnabled((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              enabled ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {enabled ? <Power size={12}/> : <PowerOff size={12}/>}
            {enabled ? 'Activa' : 'Inactiva'}
          </button>
        </div>

        <div className="flex items-center gap-3 bg-slate-900 rounded-xl px-5 py-4">
          <Scale size={22} className={enabled ? 'text-blue-400' : 'text-slate-600'} />
          <span className={`font-mono text-3xl font-extrabold tabular-nums tracking-tight ${
            !enabled           ? 'text-slate-600'
            : liveErr          ? 'text-amber-400'
            : stable && weight ? 'text-green-400'
            : 'text-white'
          }`}>
            {enabled && weight !== null ? weight.toFixed(3) : '- - -'}
          </span>
          <span className="text-slate-400 font-semibold">{unit}</span>
          {enabled && weight !== null && (
            <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
              stable ? 'bg-green-900 text-green-300' : 'bg-amber-900 text-amber-300 animate-pulse'
            }`}>
              {stable ? 'ESTABLE' : 'MIDIENDO'}
            </span>
          )}
          {enabled && !weight && !liveErr && (
            <Loader2 size={16} className="ml-auto text-slate-400 animate-spin" />
          )}
          {liveErr && (
            <span className="ml-auto flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle size={12}/> {liveErr}
            </span>
          )}
        </div>
        {portsData?.mock && (
          <p className="text-[11px] text-amber-600 mt-1.5">
            ⚠ Modo simulación — peso senoidal de prueba
          </p>
        )}
      </div>
    </Card>
  )
}

// ── Impresora ──────────────────────────────────────────────────
function PrinterCard({ toast }) {
  const testMut = useMutation({
    mutationFn: printerTest,
    onSuccess: () => toast('Página de prueba enviada', 'success'),
    onError: (e) => toast(e.message, 'error'),
  })

  return (
    <Card icon={<Printer size={15}/>} title="Impresora térmica ESC/POS">
      <div className="text-sm text-slate-500 space-y-1">
        <p>Conexión: <span className="font-semibold text-slate-700">USB auto-detect</span></p>
        <p className="text-xs text-slate-400">
          Modelos soportados: Xprinter XP-58IIL, Bixolon SRP-350III y compatibles ESC/POS.
        </p>
      </div>

      <button
        onClick={() => testMut.mutate()}
        disabled={testMut.isPending}
        className={BTN_P}
      >
        {testMut.isPending
          ? <><Loader2 size={14} className="animate-spin"/> Imprimiendo...</>
          : <><Printer size={14}/> Imprimir página de prueba</>
        }
      </button>

      {testMut.isSuccess && (
        <p className="text-xs text-green-700 flex items-center gap-1">
          <CheckCircle2 size={12}/> Página enviada correctamente
        </p>
      )}
      {testMut.isError && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle size={12}/> {testMut.error?.message}
        </p>
      )}
    </Card>
  )
}

// ── Cajón de dinero ────────────────────────────────────────────
function DrawerCard({ toast }) {
  const [reason, setReason] = useState('manual')

  const openMut = useMutation({
    mutationFn: () => openCashDrawer(null, reason),
    onSuccess: () => toast('Cajón abierto — registrado en auditoría', 'success'),
    onError: (e) => toast(e.message, 'error'),
  })

  return (
    <Card icon={<Vault size={15}/>} title="Cajón de dinero">
      <div className="text-sm text-slate-500">
        <p>Conectado al puerto <span className="font-semibold text-slate-700">cash drawer</span> de la impresora ESC/POS.</p>
        <p className="text-xs text-slate-400 mt-1">Cada apertura queda registrada en el log de auditoría con hash SHA-256.</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo de apertura</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT}>
          <option value="manual">Manual / prueba</option>
          <option value="shift_end">Cierre de turno</option>
        </select>
      </div>

      <button
        onClick={() => openMut.mutate()}
        disabled={openMut.isPending}
        className={BTN_P}
      >
        {openMut.isPending
          ? <><Loader2 size={14} className="animate-spin"/> Abriendo...</>
          : <><Vault size={14}/> Abrir cajón</>
        }
      </button>

      {openMut.isSuccess && (
        <p className="text-xs text-green-700 flex items-center gap-1">
          <CheckCircle2 size={12}/> Cajón abierto y auditado
        </p>
      )}
    </Card>
  )
}
