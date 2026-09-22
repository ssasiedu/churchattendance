import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

const variants = {
  primary: 'bg-pew-600 text-white hover:bg-pew-700 disabled:bg-pew-600/50',
  brass: 'bg-brass-500 text-pew-900 hover:bg-brass-300 disabled:opacity-50',
  outline: 'border border-slate-300 bg-white text-ink hover:bg-slate-50 disabled:opacity-50',
  ghost: 'text-ink hover:bg-slate-100 disabled:opacity-50',
  danger: 'bg-absent text-white hover:bg-absent/90 disabled:opacity-50',
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, ...props }) {
  const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-pew-500 focus:ring-2 focus:ring-pew-100 focus:outline-none'

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function Panel({ title, action, children, className }) {
  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          {title && <h2 className="font-display text-lg text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorNote({ error }) {
  if (!error) return null
  return (
    <div className="mb-4 rounded-lg border border-absent/30 bg-absent/5 px-4 py-3 text-sm text-absent">
      {typeof error === 'string' ? error : error.message}
    </div>
  )
}

export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-pew-50 text-pew-700',
    brass: 'bg-brass-100 text-brass-700',
    red: 'bg-absent/10 text-absent',
  }
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function Select({ value, onChange, options = [], placeholder = 'Select…', allowEmpty = true, ...props }) {
  return (
    <select className={inputClass} value={value ?? ''} onChange={onChange} {...props}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        return (
          <option key={val} value={val}>
            {label}
          </option>
        )
      })}
    </select>
  )
}

export function MultiSelect({ values = [], options = [], onChange, columns = 2 }) {
  function toggle(option) {
    onChange(values.includes(option) ? values.filter((v) => v !== option) : [...values, option])
  }
  return (
    <div className={cn('grid gap-1.5', columns === 2 ? 'sm:grid-cols-2' : '')}>
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={values.includes(o)} onChange={() => toggle(o)} className="size-4 accent-pew-600" />
          {o}
        </label>
      ))}
      {options.length === 0 && <p className="text-sm text-slate-500">Add options under Settings → Dropdowns.</p>}
    </div>
  )
}

export function Money({ value, className }) {
  const negative = Number(value) < 0
  return <span className={cn('tabular-nums', negative && 'text-absent', className)}>{value}</span>
}

export function Empty({ title, children }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="font-display text-lg">{title}</p>
      {children && <p className="mt-1 text-sm text-slate-600">{children}</p>}
    </div>
  )
}

export function Toolbar({ children }) {
  return <div className="no-print mb-4 flex flex-wrap items-center gap-2">{children}</div>
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
            value === o.key ? 'bg-white text-ink shadow-sm' : 'text-slate-600 hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
