export function splitPosition(value: number): { coarse: number; fine: number } {
  const raw = Math.round(Math.max(0, Math.min(1, value)) * 65535)
  return { coarse: raw >> 8, fine: raw & 255 }
}
export function positionValues(x: number, y: number, supported: string[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [attribute, value] of [['pan', x], ['tilt', y]] as const) if (supported.includes(attribute)) {
    const split = splitPosition(value); result[attribute] = supported.includes(`${attribute}Fine`) ? split.coarse : Math.round(Math.max(0, Math.min(1, value)) * 255)
    if (supported.includes(`${attribute}Fine`)) result[`${attribute}Fine`] = split.fine
  }
  return result
}
export function transformPosition(values: Record<string, number>, options?: { invertPan?: boolean; invertTilt?: boolean; swapPanTilt?: boolean }): Record<string, number> {
  if (!options) return values
  const result = { ...values }
  if (options.swapPanTilt) for (const key of ['pan', 'panFine', 'tilt', 'tiltFine']) delete result[key]
  for (const source of ['pan', 'tilt'] as const) {
    if (values[source] === undefined) continue
    const target = options.swapPanTilt ? source === 'pan' ? 'tilt' : 'pan' : source
    const invert = target === 'pan' ? options.invertPan : options.invertTilt
    const raw = Math.max(0, Math.min(65535, Math.round(values[source]) * 256 + (values[`${source}Fine`] ?? 0)))
    const transformed = invert ? 65535 - raw : raw
    result[target] = transformed >> 8
    if (`${source}Fine` in values) result[`${target}Fine`] = transformed & 255
  }
  return result
}
