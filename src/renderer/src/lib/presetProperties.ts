import type { PresetCategory } from '@shared/types'
export function matchesPresetCategory(attribute: string, category: PresetCategory): boolean {
  // Colour attributes, any pod: the bare name, the built-in "red2"
  // spelling and the OFL "red 2" spelling alike (a colour preset
  // captured from a multipart look must keep every beam, not just
  // beam 1 — Jake, 19 Nov 2026). Lime is a colour LED too.
  const color = /^(red|green|blue|white|amber|uv|lime|cyan|magenta|yellow|colorWheel) ?\d*$/.test(attribute)
  const position = attribute === 'pan' || attribute === 'tilt'
  return category === 'color' ? color : category === 'position' ? position : category === 'intensity' ? attribute === 'intensity' : !color && !position && attribute !== 'intensity'
}
