export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y' | 'space-x' | 'space-y'
export interface AlignObject { id: string; x: number; y: number; width: number; height: number }
export function alignObjects(items: AlignObject[], mode: AlignMode): Record<string, { x: number; y: number }> {
  if (items.length < 2) return Object.fromEntries(items.map((item) => [item.id, { x: item.x, y: item.y }]))
  const axis = ['left', 'right', 'center-x', 'space-x'].includes(mode) ? 'x' : 'y', size = axis === 'x' ? 'width' : 'height'
  const sorted = [...items].sort((a, b) => a[axis] - b[axis])
  const low = Math.min(...items.map((item) => item[axis] - item[size] / 2)), high = Math.max(...items.map((item) => item[axis] + item[size] / 2))
  const space = (high - low - items.reduce((sum, item) => sum + item[size], 0)) / (items.length - 1)
  let cursor = low
  return Object.fromEntries(sorted.map((item) => {
    let value = (low + high) / 2
    if (mode === 'left' || mode === 'top') value = low + item[size] / 2
    if (mode === 'right' || mode === 'bottom') value = high - item[size] / 2
    if (mode.startsWith('space')) { value = cursor + item[size] / 2; cursor += item[size] + space }
    return [item.id, { x: item.x, y: item.y, [axis]: value }]
  }))
}
