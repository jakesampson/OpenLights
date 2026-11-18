import type { PresetCategory } from '@shared/types'
export function matchesPresetCategory(attribute: string, category: PresetCategory): boolean {
  const color = /^(red|green|blue|white|amber|uv|cyan|magenta|yellow|colorWheel)([2-9])?$/.test(attribute)
  const position = attribute === 'pan' || attribute === 'tilt'
  return category === 'color' ? color : category === 'position' ? position : category === 'intensity' ? attribute === 'intensity' : !color && !position && attribute !== 'intensity'
}
