const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, opts)

/** Formats a calendar day ("2026-01-31") without shifting it through UTC. */
export const formatDay = (day: string) => new Date(`${day}T00:00`).toLocaleDateString(undefined, opts)

/** Estimated reading time: ~200 words per minute, at least 1. */
export const readingMinutes = (markdown: string) =>
  Math.max(1, Math.round(wordCount(markdown) / 200))

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const steps: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]

/** "2 days ago", "just now"… */
export function timeAgo(iso: string, now = Date.now()) {
  const seconds = (new Date(iso).getTime() - now) / 1000
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  return 'just now'
}

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
