import { parseDate } from './utils'

export function money(amount, symbol = 'GH₵') {
  const n = Number(amount ?? 0)
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function compactMoney(amount, symbol = 'GH₵') {
  const n = Number(amount ?? 0)
  if (Math.abs(n) >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}m`
  if (Math.abs(n) >= 10_000) return `${symbol}${(n / 1000).toFixed(1)}k`
  return money(n, symbol)
}

/** 0244123456 → 233244123456, the format Hubtel expects */
export function toInternational(raw, dial = '233') {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (!digits) return null
  if (digits.startsWith(dial) && digits.length >= dial.length + 9) return digits
  if (digits.startsWith('0')) return dial + digits.slice(1)
  if (digits.length === 9) return dial + digits
  return digits.length >= 10 ? digits : null
}

export function age(dateOfBirth) {
  const d = parseDate(dateOfBirth)
  if (!d) return null
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000))
}

/** GSM-7 messages are 160 characters; anything else drops to 70 per part */
export function smsParts(text) {
  const unicode = /[^\u0000-\u007F]/.test(text)
  const size = unicode ? 70 : 160
  const len = [...text].length
  return { unicode, length: len, parts: len === 0 ? 0 : Math.ceil(len / size), size }
}
