// Jake, 22 Nov 2026 — preset CREATION matches LightKey: right-click →
// New Preset creates immediately from whatever was touched in Design
// (no name box, no property dropdown), auto-named from the colour
// ("Orange") or the dimmer percentage ("28%", "Off", "Full On"), and
// left in rename mode. New Preset With Snapshot captures the combined
// look — applied presets plus further overrides — on the selected
// fixtures. Clicking a preset shows its saved values as labels in the
// Preview (previewPresetId, rendered by StagePreview).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { autoPresetName, colorNameForRgb, derivePresetCategory, uniquePresetName } from '../src/renderer/src/lib/presetAutoName'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('requestAnimationFrame', () => 1)
vi.stubGlobal('cancelAnimationFrame', () => {})

function setUp() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: ['a', 'b'].map((id, i) => ({ id, name: id.toUpperCase(), type: 'par', channelStart: 1 + i * 4, channels: 4 })),
    cues: [{ id: 'c1', name: 'Cue 1', presetIds: [], sequenceIds: [], fadeMs: 0,
      fixtureValues: { a: { intensity: 100, red: 10 }, b: { intensity: 100, red: 10 } } }],
    // The cue survives migration only in a holder (Jake, 27 Nov 2026
    // — inline cues): the seed button carries it.
    livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', cueId: 'c1', presetIds: [] }] }],
    cueLists: []
  }))
  s().selectFixtures(['a'])
  s().activateCue('c1')
  return s
}

beforeEach(() => { useShowStore.getState().setShow(null) })

describe('LightKey auto-naming', () => {
  it('names colours by hue with a Dark/Light qualifier', () => {
    expect(colorNameForRgb(255, 165, 0)).toBe('Orange')
    expect(colorNameForRgb(0, 0, 139)).toBe('Dark Blue')
    expect(colorNameForRgb(0, 0, 255)).toBe('Blue')
    expect(colorNameForRgb(255, 255, 255)).toBe('White')
    expect(colorNameForRgb(255, 0, 0)).toBe('Red')
  })
  it('names a dimmer-only capture by percentage, Off at 0 and Full On at 100', () => {
    expect(autoPresetName({ a: { intensity: 71 } }, ['a'])).toBe('28%')
    expect(autoPresetName({ a: { intensity: 0 } }, ['a'])).toBe('Off')
    expect(autoPresetName({ a: { intensity: 255 } }, ['a'])).toBe('Full On')
    expect(autoPresetName({ a: { intensity: 179 } }, ['a'])).toBe('70%')
  })
  it('names by colour when both colour and dimmer were touched', () => {
    expect(autoPresetName({ a: { red: 255, green: 165, blue: 0, intensity: 200 } }, ['a'])).toBe('Orange')
  })
  it('returns null for an empty capture and derives the category from the values', () => {
    expect(autoPresetName({}, ['a'])).toBeNull()
    expect(derivePresetCategory({ a: { red: 255, intensity: 100 } })).toBe('color')
    expect(derivePresetCategory({ a: { intensity: 100 } })).toBe('intensity')
    expect(derivePresetCategory({ a: { pan: 128 } })).toBe('position')
    expect(uniquePresetName('28%', ['28%'])).toBe('28% 2')
    expect(uniquePresetName('28%', ['28%', '28% 2'])).toBe('28% 3')
  })
})

describe('capturePresetFromLook (plain New Preset)', () => {
  it('captures only what was touched, auto-named by the dimmer percentage', () => {
    const s = setUp()
    // The active cue holds intensity 100 + red 10 — neither is touched,
    // so neither may be saved: only the dimmer override is captured.
    s().updateSelectedFixtures({ intensity: 71 }, true)
    const created = s().capturePresetFromLook(false)
    expect(created).toEqual({ id: expect.any(String), name: '28%' })
    const preset = s().presets[0]
    expect(preset.id).toBe(created!.id)
    expect(preset.category).toBe('intensity')
    expect(preset.fixtureValues).toEqual({ a: { intensity: 71 } })
  })
  it('captures a touched colour under its colour name', () => {
    const s = setUp()
    s().setSelectedColor({ red: 255, green: 165, blue: 0 }, true)
    const created = s().capturePresetFromLook(false)
    expect(created?.name).toBe('Orange')
    expect(s().presets[0].category).toBe('color')
    expect(s().presets[0].fixtureValues).toEqual({ a: { red: 255, green: 165, blue: 0 } })
  })
  it('captures nothing when nothing was touched, and nothing without a selection', () => {
    const s = setUp()
    expect(s().capturePresetFromLook(false)).toBeNull()
    expect(s().presets).toHaveLength(0)
    s().updateSelectedFixtures({ intensity: 71 }, true)
    s().selectFixtures([])
    expect(s().capturePresetFromLook(false)).toBeNull()
    expect(s().presets).toHaveLength(0)
  })
  it('does not need an active cue — the touched values are enough', () => {
    const s = setUp()
    // stopCue only stops playback; a truly cue-less look has no active cue.
    useShowStore.setState({ activeCueRef: null })
    s().updateSelectedFixtures({ intensity: 71 }, true)
    expect(s().capturePresetFromLook(false)?.name).toBe('28%')
  })
  it('suffixes a duplicate auto-name instead of colliding', () => {
    const s = setUp()
    s().updateSelectedFixtures({ intensity: 71 }, true)
    expect(s().capturePresetFromLook(false)?.name).toBe('28%')
    expect(s().capturePresetFromLook(false)?.name).toBe('28% 2')
  })
  it('files the preset into the right-clicked group when given', () => {
    const s = setUp()
    s().createPresetGroup('Wash')
    const group = s().show!.presetGroups!.at(-1)!
    s().updateSelectedFixtures({ intensity: 71 }, true)
    const created = s().capturePresetFromLook(false, group.id)
    expect(created).not.toBeNull()
    expect(s().show!.presetGroups!.find((g) => g.id === group.id)?.presetIds).toContain(created!.id)
  })
})

describe('capturePresetFromLook (New Preset With Snapshot)', () => {
  it('captures the combined look: applied preset values plus further overrides', () => {
    const s = setUp()
    // Jake's example: a blue colour preset selected, then the dimmer
    // adjusted to 90% on the same fixtures — the snapshot holds both.
    s().setSelectedColor({ red: 0, green: 0, blue: 255 }, true)
    const blue = s().capturePresetFromLook(false)!
    expect(blue.name).toBe('Blue')
    s().togglePreset(blue.id)
    s().updateSelectedFixtures({ intensity: 230 }, true)
    const created = s().capturePresetFromLook(true)
    // "Blue" already exists (the source preset), so the snapshot is
    // suffixed — the name is unique, the values are the combined look.
    expect(created?.name).toBe('Blue 2')
    expect(s().presets[1].category).toBe('color')
    expect(s().presets[1].fixtureValues).toEqual({ a: { red: 0, green: 0, blue: 255, intensity: 230 } })
  })
  it('includes the active cue values in the combined look', () => {
    const s = setUp()
    s().updateSelectedFixtures({ intensity: 230 }, true)
    const created = s().capturePresetFromLook(true)
    // Cue red 10 + override intensity 230: the cue's colour survives,
    // the override wins the dimmer. Red 10/255 is essentially black,
    // so the auto-name is Black — the point is the values, not the name.
    // The snapshot carries the whole base colour (Jake, 22 Nov 2026):
    // green and blue are 0 in the combined look, so they are written.
    expect(s().presets[0].fixtureValues).toEqual({ a: { intensity: 230, red: 10, green: 0, blue: 0 } })
    expect(created?.name).toBe('Black')
  })
  it('snapshots without an active cue from presets + overrides alone', () => {
    const s = setUp()
    useShowStore.setState({ activeCueRef: null })
    s().setSelectedColor({ red: 0, green: 0, blue: 255 }, true)
    const blue = s().capturePresetFromLook(false)!
    s().togglePreset(blue.id)
    s().updateSelectedFixtures({ intensity: 230 }, true)
    expect(s().capturePresetFromLook(true)?.name).toBe('Blue 2')
    expect(s().presets[1].fixtureValues).toEqual({ a: { red: 0, green: 0, blue: 255, intensity: 230 } })
  })
})

describe('previewPresetId (Preview labels for the selected preset)', () => {
  it('is set, and clears when the preset is deleted or the show closes', () => {
    const s = setUp()
    s().updateSelectedFixtures({ intensity: 71 }, true)
    const created = s().capturePresetFromLook(false)!
    s().setPreviewPresetId(created.id)
    expect(s().previewPresetId).toBe(created.id)
    s().deletePreset(created.id)
    expect(s().previewPresetId).toBeNull()
    s().setPreviewPresetId('nope')
    s().setShow(null)
    expect(s().previewPresetId).toBeNull()
  })
})
