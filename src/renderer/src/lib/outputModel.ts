/**
 * Low to high: base, sequences, effects, Live cues, manually activated presets,
 * Design overrides, temporary Locate. Master scales explicitly marked intensity channels only.
 * Blind/freeze return a held frame; blackout overrides even that held frame.
 * Manual presets retain their existing precedence over effects and Live cues.
 */
export type OutputPatch = Record<number, number>
export interface OutputLayers {
  base?: OutputPatch
  sequences?: OutputPatch
  effects?: OutputPatch
  live?: OutputPatch
  presets?: OutputPatch
  overrides?: OutputPatch
  locate?: OutputPatch
  master?: number
  intensityChannels?: number[]
  blackout?: boolean
  blind?: boolean
  freeze?: boolean
  heldFrame?: OutputPatch
  previousChannels?: number[]
  disabledChannels?: number[]
}
export function composeOutput(layers: OutputLayers): OutputPatch {
  if (layers.blackout) return Object.fromEntries(Array.from({ length: 512 }, (_, i) => [i + 1, 0]))
  if ((layers.blind || layers.freeze) && layers.heldFrame) return { ...layers.heldFrame }
  const result = { ...layers.base, ...layers.sequences, ...layers.effects, ...layers.live, ...layers.presets, ...layers.overrides, ...layers.locate }
  for (const channel of layers.previousChannels ?? []) if (!(channel in result)) result[channel] = 0
  for (const channel of layers.disabledChannels ?? []) result[channel] = 0
  const intensity = new Set(layers.intensityChannels ?? [])
  for (const [key, value] of Object.entries(result)) {
    const channel = Number(key)
    result[channel] = Math.max(0, Math.min(255, Math.round(intensity.has(channel) ? value * (layers.master ?? 255) / 255 : value)))
  }
  return result
}
