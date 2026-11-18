export interface Bounds { x: number; y: number; width: number; height: number }
/** Return a viewport with the preview aspect ratio and room around every item. */
export function fitPreview(items: Bounds[], padding = 20): Bounds {
  const valid = items.filter((b) => [b.x, b.y, b.width, b.height].every(Number.isFinite))
  if (!valid.length) return { x: 0, y: 0, width: 800, height: 340 }
  const left = Math.min(...valid.map((b) => b.x)), top = Math.min(...valid.map((b) => b.y))
  const right = Math.max(...valid.map((b) => b.x + b.width)), bottom = Math.max(...valid.map((b) => b.y + b.height))
  const width = Math.max(100, right - left + padding * 2, (bottom - top + padding * 2) * 800 / 340)
  const height = width * 340 / 800
  return { x: (left + right - width) / 2, y: (top + bottom - height) / 2, width, height }
}
