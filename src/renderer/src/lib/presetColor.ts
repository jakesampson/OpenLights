import type { CueDef, PresetDef } from '@shared/types'
import { resolveCueValues } from '@shared/cueResolution'

/**
 * A preset's base colour is the fixture's whole base colour (Jake,
 * 22 Nov 2026) — the shared rule in @shared/cueResolution.ts, which
 * the cue layer resolves too: when a preset names any part of a
 * fixture's base colour — RGB, or CMY where the fixture has all three
 * — the parts it does not name are 0, not "whatever the layer
 * underneath says". Without this, a Red preset over the lifted default
 * blue (a dimmer alone raises blue, Jake 22 Nov 2026) comes out
 * magenta: the base blue leaks through the blue channel the preset
 * never wrote. White / Amber / UV / Lime are separate LEDs and
 * independent properties (Guide p.85), so they are never filled and
 * never trigger the fill. A preset that names no base colour at all (a
 * dimmer preset) is untouched. Apply after fanPresetFixtureValues, so
 * the fill covers every beam of a multipart fixture.
 */
export { completeBaseColour as completePresetBaseColour } from '@shared/cueResolution'

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

/**
 * The colour dot for a palette row (Jake, 22 Nov 2026 — LightKey's
 * palette shows each preset's actual colour as the dot; a dimmer-only
 * preset shows a sun icon instead). Averages the preset's own fixture
 * values the same way liveControlButtonColor does (white/amber mixed
 * into RGB, peak scaled to 220), without skipping dark fixtures — the
 * dot is the association with the preset, not whether it is lit.
 * Returns null when the preset names no colour at all (dimmer-only,
 * UV/Lime-only), so the caller renders the dimmer icon. The old dot
 * was a category colour (pink for every colour preset), which is why
 * Green showed a pink dot.
 */
export function getPresetDotColor(preset: PresetDef): string | null {
  let red = 0
  let green = 0
  let blue = 0
  let count = 0
  let named = false
  for (const values of Object.values(preset.fixtureValues ?? {})) {
    const white = clampByte(values['white'] ?? 0)
    const amber = clampByte(values['amber'] ?? 0)
    if (values['red'] || values['green'] || values['blue'] || white || amber) named = true
    red += clampByte((values['red'] ?? 0) + white + amber)
    green += clampByte((values['green'] ?? 0) + white + amber * 0.45)
    blue += clampByte((values['blue'] ?? 0) + white)
    count++
  }
  if (!named || !count) return null
  red /= count
  green /= count
  blue /= count
  const peak = Math.max(red, green, blue)
  if (peak === 0) return null
  const scale = 220 / peak
  const hex = (value: number) => clampByte(value * scale).toString(16).padStart(2, '0')
  return `#${hex(red)}${hex(green)}${hex(blue)}`
}

/** The cue's representative colour — from its resolved look (Piece 8),
 *  so a colour defined by a preset the cue references colours the dot,
 *  not just a colour stored on the cue itself. */
export function getPresetColor(cue: CueDef, presets: PresetDef[] = []): string {
  let red = 0
  let green = 0
  let blue = 0
  let count = 0

  for (const values of Object.values(resolveCueValues(cue, presets))) {
    const intensity = clampByte(values.intensity ?? 255) / 255
    if (intensity === 0) continue

    const white = clampByte(values.white ?? 0)
    const amber = clampByte(values.amber ?? 0)
    red += clampByte((values.red ?? 0) + white + amber) * intensity
    green += clampByte((values.green ?? 0) + white + amber * 0.45) * intensity
    blue += clampByte((values.blue ?? 0) + white) * intensity
    count++
  }

  if (!count) return '#777777'

  red /= count
  green /= count
  blue /= count
  const peak = Math.max(red, green, blue)
  if (peak === 0) return '#777777'

  const scale = 220 / peak
  const hex = (value: number) => clampByte(value * scale).toString(16).padStart(2, '0')
  return `#${hex(red)}${hex(green)}${hex(blue)}`
}
