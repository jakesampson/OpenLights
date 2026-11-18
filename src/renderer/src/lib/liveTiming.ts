/**
 * LightKey-style cue timing display (Guide ch.11, "Timing", p.199):
 * fade times are shown as mm:ss.t — minutes, seconds, tenths of a second
 * (e.g. 500ms renders as "00:00.5"). The model still stores milliseconds.
 */

/** 500 -> "00:00.5"; 65000 -> "01:05.0"; 0 -> "00:00.0". */
export function formatTimingMs(ms: number): string {
  const totalTenths = Math.max(0, Math.round(ms / 100))
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor((totalTenths % 600) / 10)
  const tenths = totalTenths % 10
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(minutes)}:${pad(seconds)}.${tenths}`
}

/**
 * Parse "mm:ss.t", "ss.t" or plain seconds ("0.5") back to milliseconds.
 * Returns null for anything unparsable so the caller can keep the old value.
 */
export function parseTimingMs(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':')
  if (parts.length > 2) return null
  const secondsText = parts.length === 2 ? parts[1] : parts[0]
  const minutes = parts.length === 2 ? Number(parts[0]) : 0
  const seconds = Number(secondsText)
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0) return null
  if (parts.length === 2 && !/^\d+$/.test(parts[0])) return null
  return Math.round((minutes * 60 + seconds) * 1000)
}
