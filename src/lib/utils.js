export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

// service_date is a plain date ("2026-09-13"); parse as local, not UTC
export function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(value, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parseDate(value)
  return d ? d.toLocaleDateString(undefined, opts) : ''
}

export function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function toISODate(date) {
  const d = new Date(date)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export function monthKey(value) {
  return String(value).slice(0, 7) // YYYY-MM
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

export function pct(part, whole) {
  if (!whole) return 0
  return Math.round((part / whole) * 1000) / 10
}

export function normalize(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function matchesSearch(name, query) {
  const q = normalize(query).trim()
  if (!q) return true
  const n = normalize(name)
  return q.split(/\s+/).every((token) => n.includes(token))
}

export function initials(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

// ---------- CSV ----------
function csvCell(value) {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCSV(filename, rows, columns) {
  const header = columns.map((c) => csvCell(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => csvCell(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','))
  const blob = new Blob(['\uFEFF' + [header, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function parseCSV(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const cleaned = rows.filter((r) => r.some((c) => c.trim() !== ''))
  if (!cleaned.length) return []
  const headers = cleaned[0].map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_'))
  return cleaned.slice(1).map((r) => Object.fromEntries(headers.map((h, idx) => [h, (r[idx] ?? '').trim()])))
}
