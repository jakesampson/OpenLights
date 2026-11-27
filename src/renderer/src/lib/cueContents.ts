import type { CueDef, LiveControl } from '@shared/types'

export type CueContentsCommand =
  | { type: 'add-preset' | 'remove-preset' | 'add-sequence' | 'remove-sequence'; id: string }
  | { type: 'set-ad-hoc'; fixtureId: string; property: string; value: number }
  | { type: 'remove-ad-hoc'; fixtureId: string; property?: string }
  | { type: 'clear-ad-hoc' }

const changeId = (items: string[], id: string, add: boolean) => add ? [...new Set([...items, id])] : items.filter((item) => item !== id)

export function applyCueContents(control: LiveControl, command: CueContentsCommand): LiveControl {
  if (command.type === 'add-preset' || command.type === 'remove-preset') return { ...control, presetIds: changeId(control.presetIds, command.id, command.type === 'add-preset') }
  if (command.type === 'add-sequence' || command.type === 'remove-sequence') return { ...control, sequenceIds: changeId(control.sequenceIds ?? [], command.id, command.type === 'add-sequence') }
  if (command.type === 'clear-ad-hoc') return { ...control, adHocValues: {} }
  if (command.type !== 'set-ad-hoc' && command.type !== 'remove-ad-hoc') return control
  const adHocValues = structuredClone(control.adHocValues ?? {})
  if (command.type === 'set-ad-hoc') {
    adHocValues[command.fixtureId] = { ...adHocValues[command.fixtureId], [command.property]: Math.max(0, Math.min(255, Math.round(command.value))) }
  } else if (command.property) {
    const values = { ...adHocValues[command.fixtureId] }
    delete values[command.property]
    if (Object.keys(values).length) adHocValues[command.fixtureId] = values
    else delete adHocValues[command.fixtureId]
  } else delete adHocValues[command.fixtureId]
  return { ...control, adHocValues }
}

/**
 * The same commands against a cue definition (Jake, 27 Nov 2026 —
 * LightKey cue editing: a button's Get Info list edits the CUE's
 * ingredients, not the button's own lists). Presets/sequences join or
 * leave the cue's references; ad-hoc commands edit the cue's own
 * fixtureValues, which resolve last over the presets (see
 * shared/cueResolution.ts).
 */
export function applyCueDefContents(cue: CueDef, command: CueContentsCommand): CueDef {
  if (command.type === 'add-preset' || command.type === 'remove-preset') return { ...cue, presetIds: changeId(cue.presetIds ?? [], command.id, command.type === 'add-preset') }
  if (command.type === 'add-sequence' || command.type === 'remove-sequence') return { ...cue, sequenceIds: changeId(cue.sequenceIds ?? [], command.id, command.type === 'add-sequence') }
  if (command.type === 'clear-ad-hoc') return { ...cue, fixtureValues: {} }
  if (command.type !== 'set-ad-hoc' && command.type !== 'remove-ad-hoc') return cue
  const fixtureValues = structuredClone(cue.fixtureValues ?? {})
  if (command.type === 'set-ad-hoc') {
    fixtureValues[command.fixtureId] = { ...fixtureValues[command.fixtureId], [command.property]: Math.max(0, Math.min(255, Math.round(command.value))) }
  } else if (command.property) {
    const values = { ...fixtureValues[command.fixtureId] }
    delete values[command.property]
    if (Object.keys(values).length) fixtureValues[command.fixtureId] = values
    else delete fixtureValues[command.fixtureId]
  } else delete fixtureValues[command.fixtureId]
  return { ...cue, fixtureValues }
}
