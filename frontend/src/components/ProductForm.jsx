import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils.js'

const schema = z.object({
  name:        z.string().min(1, 'Nombre requerido'),
  price:       z.coerce.number({ invalid_type_error: 'Ingresa un precio' }).positive('Debe ser mayor a 0'),
  cost_price:  z.coerce.number().min(0).default(0),
  barcode:     z.string().optional(),
  stock:       z.coerce.number().int().min(0).default(0),
  min_stock:   z.coerce.number().int().min(0).default(0),
  category_id: z.string().optional(),
})

/**
 * ProductForm — modo crear (product=null) o editar (product=objeto).
 * Props:
 *   product    — producto a editar (null = crear)
 *   categories — [{ id, name }] lista de categorías disponibles
 *   onSave     — fn(data) → Promise
 *   onCancel   — fn() para limpiar selección (solo modo editar)
 *   loading    — bool
 */
export default function ProductForm({ product = null, categories = [], onSave, onCancel, loading }) {
  const isEdit = product !== null

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: isEdit
      ? {
          name:        product.name,
          price:       product.price,
          cost_price:  product.cost_price,
          barcode:     product.barcode ?? '',
          stock:       product.stock,
          min_stock:   product.min_stock ?? 0,
          category_id: product.category_id ?? '',
        }
      : { name: '', price: '', cost_price: '', barcode: '', stock: 0, min_stock: 0, category_id: '' },
  })

  // Sincronizar si cambia el producto seleccionado
  useEffect(() => {
    if (isEdit) {
      reset({
        name:        product.name,
        price:       product.price,
        cost_price:  product.cost_price,
        barcode:     product.barcode ?? '',
        stock:       product.stock,
        min_stock:   product.min_stock ?? 0,
        category_id: product.category_id ?? '',
      })
    } else {
      reset({ name: '', price: '', cost_price: '', barcode: '', stock: 0, min_stock: 0, category_id: '' })
    }
  }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (data) => {
    await onSave({
      name:        data.name.trim(),
      price:       data.price,
      cost_price:  data.cost_price ?? 0,
      barcode:     data.barcode?.trim() || null,
      stock:       data.stock ?? 0,
      min_stock:   data.min_stock ?? 0,
      category_id: data.category_id || null,
    })
    if (!isEdit) reset()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">

      <Field label="Nombre *" error={errors.name?.message}>
        <input
          {...register('name')}
          placeholder="Ej: Gaseosa 350ml"
          className={inputCls(errors.name)}
        />
      </Field>

      {/* Categoría */}
      <Field label="Categoría" error={errors.category_id?.message}>
        <select
          {...register('category_id')}
          className={cn(inputCls(errors.category_id), 'bg-white')}
        >
          <option value="">— Sin categoría —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio de venta *" error={errors.price?.message}>
          <input
            {...register('price')}
            type="number"
            min="0"
            step="any"
            placeholder="0"
            className={inputCls(errors.price)}
          />
        </Field>
        <Field label="Costo" error={errors.cost_price?.message}>
          <input
            {...register('cost_price')}
            type="number"
            min="0"
            step="any"
            placeholder="0"
            className={inputCls(errors.cost_price)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Barcode" error={errors.barcode?.message}>
          <input
            {...register('barcode')}
            placeholder="Opcional"
            className={inputCls(errors.barcode)}
          />
        </Field>
        <Field label="Stock inicial" error={errors.stock?.message}>
          <input
            {...register('stock')}
            type="number"
            min="0"
            placeholder="0"
            className={inputCls(errors.stock)}
          />
        </Field>
      </div>

      <Field
        label="Alerta de stock mínimo"
        hint="Se marcará como bajo stock cuando llegue a este nivel."
        error={errors.min_stock?.message}
      >
        <input
          {...register('min_stock')}
          type="number"
          min="0"
          placeholder="0"
          className={cn(inputCls(errors.min_stock), 'w-32')}
        />
      </Field>

      <div className={cn('flex gap-2 mt-1', isEdit && 'flex-col')}>
        <button
          type="submit"
          disabled={loading}
          className={cn(
            'flex-1 py-2.5 rounded-lg font-bold text-sm text-white transition-colors',
            loading
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 cursor-pointer',
          )}
        >
          {loading ? 'Guardando...' : isEdit ? 'Actualizar Producto' : 'Guardar Producto'}
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={onCancel}
            className="py-2 rounded-lg font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}

function inputCls(error) {
  return cn(
    'px-3 py-2 text-sm border rounded-lg outline-none w-full transition-colors',
    error
      ? 'border-red-400 focus:border-red-500'
      : 'border-slate-300 focus:border-blue-500'
  )
}
