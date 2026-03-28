import { formatCOP } from '@/lib/utils.js'

export default function CheckoutButton({ total, disabled, loading, onClick }) {
  const isDisabled = disabled || loading

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`w-full py-4 rounded-xl font-extrabold text-xl tracking-wide text-white transition-all
        ${isDisabled
          ? 'bg-slate-400 cursor-not-allowed shadow-none'
          : 'bg-green-600 hover:bg-green-700 cursor-pointer shadow-lg shadow-green-600/30 active:scale-[0.99]'
        }`}
    >
      {loading ? 'Procesando...' : `COBRAR $${formatCOP(total)}`}
    </button>
  )
}
