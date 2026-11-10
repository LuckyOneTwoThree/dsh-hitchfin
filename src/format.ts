/**
 * Quota presentation helpers.
 *
 * A channel package reports a usage window the way magpie's plugin contract
 * defines it: `used` is the share spent, in percent, and `amount` / `limit` /
 * `unit` are the vendor's own count ("2.61 of 20 credits"). Some vendors also
 * send a `display` string they already formatted ("200.0M / 200M"). Anything
 * here that is not told is not invented — when a window carries a count it is
 * shown as a count, and a bare share is shown as a percentage, never as the
 * raw float a percentage happens to be.
 */

/** The parts of a channel usage window this module reads. */
export interface QuotaWindowLike {
  name?: string
  /** Share used, in percent. */
  used?: number
  /** Count used of `limit`, in `unit`. */
  amount?: number
  limit?: number
  unit?: string
  /** The vendor's own number format, preferred when present. */
  display?: string
  resetsAt?: string
  free?: boolean
}

/** Used and total from a vendor display such as "183 / 2,000 credits". */
export function parsePercent(display: string): number | undefined {
  const match = display.match(/([\d,.]+)\s*\/\s*([\d,.]+)/)
  if (!match) return undefined
  const used = Number(match[1].replace(/,/g, ''))
  const total = Number(match[2].replace(/,/g, ''))
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return undefined
  return Math.max(0, Math.min(100, (used / total) * 100))
}

/**
 * Two places at most, trailing zeros dropped: 13.033177142857145 -> "13.03".
 * A count is never shown at the float precision the vendor happened to use.
 */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

/** compactNumber with its thousands apart: 12345.5 -> "12,345.5". */
export function groupedNumber(value: number): string {
  const text = compactNumber(value)
  if (!text) return ''
  const negative = text.startsWith('-')
  const [wholePart, fraction] = (negative ? text.slice(1) : text).split('.')
  const whole = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

function withUnit(count: string, unit?: string): string {
  const label = unit?.trim()
  return label ? `${count} ${label}` : count
}

/**
 * A window's count, as the vendor says it.
 *
 * The vendor's own `display` wins when it sent one: it may be abbreviated
 * ("200.0M / 200M") in a way a plain count cannot be. Otherwise the count is
 * rebuilt from `amount` / `limit` / `unit`, and a window that only reports a
 * share says that share rather than the float behind it.
 */
export function quotaValue(window: QuotaWindowLike): string {
  const display = window.display?.trim()
  if (display) return display
  const limit = window.limit
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    const used = typeof window.amount === 'number' && Number.isFinite(window.amount) ? window.amount : 0
    return withUnit(`${groupedNumber(used)} / ${groupedNumber(limit)}`, window.unit)
  }
  if (typeof window.amount === 'number' && Number.isFinite(window.amount)) {
    return withUnit(groupedNumber(window.amount), window.unit)
  }
  const percent = quotaPercent(window)
  return percent === undefined ? '' : `${compactNumber(percent)}%`
}

/** The share spent, in percent: the window's own reading, else its display. */
export function quotaPercent(window: QuotaWindowLike): number | undefined {
  if (typeof window.used === 'number' && Number.isFinite(window.used)) {
    return Math.max(0, Math.min(100, window.used))
  }
  const display = window.display?.trim()
  return display ? parsePercent(display) : undefined
}
