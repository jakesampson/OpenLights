import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { allocateFixtures, dipSwitchesForAddress, findConflicts, fixtureWidth, placementError } from '../src/renderer/src/lib/patch'
import { BUILTIN_PROFILES, fixtureBeams, fixtureChannelMap, modeChannelOffset } from '../src/shared/fixtureProfiles'
describe('batch fixture patching', () => {
  it('allocates a quantity with consecutive names and non-overlapping addresses', () => {
    const fixtures = allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 4, start: 1, name: 'Wash' })
    expect(fixtures.map((f) => f.channelStart)).toEqual([1, 5, 9, 13])
    expect(fixtures.map((f) => f.name)).toEqual(['Wash 1', 'Wash 2', 'Wash 3', 'Wash 4'])
    expect(allocateFixtures(fixtures, BUILTIN_PROFILES[0], { quantity: 1, start: 2 })[0].channelStart).toBe(17)
    expect(() => allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 4, start: 510 })).toThrow('Not enough')
    expect(() => allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 1, start: 1, universe: 2 })).toThrow('universe 1')
  })
})

describe('DIP switch guide (Patching tab)', () => {
  it('maps a DMX address to the nine DIP switches (address = sum of ON switch values)', () => {
    // Address 1 is switch 1 (value 1) ON; address 5 is switches 1 + 3 (1 + 4).
    expect(dipSwitchesForAddress(1)).toEqual([true, false, false, false, false, false, false, false, false])
    expect(dipSwitchesForAddress(5)).toEqual([true, false, true, false, false, false, false, false, false])
    expect(dipSwitchesForAddress(511)).toEqual(Array(9).fill(true))
    // 512 is outside the 9-switch range — the guide shows all OFF and the
    // dialog notes it instead of pretending the switches cover it.
    expect(dipSwitchesForAddress(512)).toEqual(Array(9).fill(false))
    expect(dipSwitchesForAddress(0)).toEqual(Array(9).fill(false))
  })

  it('stores notes and Ext. reference from the patch dialog on the fixture', () => {
    const fixtures = allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 1, start: 1, notes: 'Front wash', extReference: 'RIG-A' })
    expect(fixtures[0].notes).toBe('Front wash')
    expect(fixtures[0].extReference).toBe('RIG-A')
    expect(allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 1, start: 1 })[0].notes).toBeUndefined()
  })
})

it('validates exact drag placement and channel spans across visual rows', () => {
  const eightChannel = BUILTIN_PROFILES.find((profile) => profile.id === 'head-8ch')!
  expect(fixtureWidth(eightChannel, 'default')).toBe(8)
  expect(placementError([], 10, 8)).toBeNull()
  // A fixture beginning at 22 occupies 22–29, crossing the 24-channel row.
  expect(placementError([], 22, 8)).toBeNull()
  expect(placementError([], 506, 8)).toContain('1–512')
  const occupied = allocateFixtures([], eightChannel, { quantity: 1, start: 10 })
  expect(placementError(occupied, 17, 8)).toContain('occupied')
  expect(placementError(occupied, 18, 8)).toBeNull()
  expect(placementError(occupied, 22, 8, occupied[0].id)).toBeNull()
})

it('renders the full 512-address drag matrix with separate brand and model panels', () => {
  const source = readFileSync('src/renderer/src/components/PatchPanel.tsx', 'utf8')
  expect(source).toContain('aria-label="Fixture brands"')
  expect(source).toContain('aria-label="Fixture models"')
  expect(source).toContain('Array.from({ length: 512 }')
  expect(source).toContain("gridTemplateColumns: 'repeat(24, minmax(0, 1fr))'")
  expect(source).toContain('onDragStart')
  expect(source).toContain('onDrop')
  expect(source).toContain("kind: 'fixture'")
  expect(source).toContain('updateFixture(dragged.payload.fixtureId, { channelStart: start })')
  expect(source).toContain("'!bg-blue-600/85 !text-white'")
  expect(source).toContain("setDragImage(document.createElement('canvas')")
})

it('keeps the full-window Done button clear of macOS window controls', () => {
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  const styles = readFileSync('src/renderer/src/index.css', 'utf8')
  expect(app).toContain("/Macintosh|Mac OS X/.test(navigator.userAgent)")
  expect(app).toContain("'patch-dialog-header-mac'")
  expect(styles).toContain('.patch-dialog-header-mac')
  expect(styles).toContain('padding-left: 184px')
  expect(styles).toContain('left: 108px')
  expect(styles).toContain('width: 64px')
  expect(styles).toContain('min-height: 50px')
  expect(styles).toContain('-webkit-app-region: no-drag')
})

it('reports overlaps and address overflow without flagging adjacent spans', () => {
 const a = allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 2, start: 1 })
 expect(findConflicts(a)).toEqual([])
 expect(findConflicts([a[0], { ...a[1], channelStart: 3 }])[0]).toMatchObject({ type: 'overlap', channels: [3, 4] })
 expect(findConflicts([{ ...a[0], channelStart: 511 }])[0].type).toBe('out-of-range')
 expect(findConflicts([a[0], { ...a[1], channelStart: 1, universe: 2 }])).toEqual([])
})

it('patches a consecutive batch with auto-incrementing short names (Guide p.30)', () => {
  const heads = BUILTIN_PROFILES.find((profile) => profile.id === 'head-8ch')!
  const batch = allocateFixtures([], heads, { quantity: 6, start: 1, shortName: 'MH1' })
  expect(batch.map((f) => f.shortName)).toEqual(['MH1', 'MH2', 'MH3', 'MH4', 'MH5', 'MH6'])
  expect(batch.map((f) => f.channelStart)).toEqual([1, 9, 17, 25, 33, 41])
  expect(batch.map((f) => f.name)).toEqual(['Moving Head (8ch) 1', 'Moving Head (8ch) 2', 'Moving Head (8ch) 3', 'Moving Head (8ch) 4', 'Moving Head (8ch) 5', 'Moving Head (8ch) 6'])
  // No short name given: the type-based proposal is used, skipping names already in the show.
  const next = allocateFixtures(batch, heads, { quantity: 2, start: 49 })
  expect(next.map((f) => f.shortName)).toEqual(['MH7', 'MH8'])
  // A short name ending in a number increments from there (Guide p.30: MH6 → MH6..MH9).
  expect(allocateFixtures([], heads, { quantity: 4, start: 65, shortName: 'MH6' }).map((f) => f.shortName)).toEqual(['MH6', 'MH7', 'MH8', 'MH9'])
  // A name already in use is skipped so two fixtures never share a short name.
  expect(allocateFixtures(batch, heads, { quantity: 2, start: 65, shortName: 'MH2' }).map((f) => f.shortName)).toEqual(['MH7', 'MH8'])
})

it('patches several fixtures to the same address with Count (Guide p.30)', () => {
  const pars = BUILTIN_PROFILES[0]
  const [one] = allocateFixtures([], pars, { quantity: 1, start: 1, shortName: 'P1', count: 3 })
  expect(one.count).toBe(3)
  expect(one.channelStart).toBe(1)
  expect(one.channels).toBe(4)
  expect(one.shortName).toBe('P1')
  expect(allocateFixtures([], pars, { quantity: 1, start: 1 })[0].count).toBeUndefined()
})

it('grows and shrinks a flexible LED strip with the LED count (Guide p.29, FLEX)', () => {
  const bar = BUILTIN_PROFILES.find((profile) => profile.id === 'pan-4x1x30-17ch')!
  expect(fixtureWidth(bar, 'default')).toBe(17)
  expect(fixtureWidth(bar, 'default', 2)).toBe(11)
  expect(fixtureWidth(bar, 'default', 1)).toBe(8)
  const two = allocateFixtures([], bar, { quantity: 1, start: 1, ledCount: 2 })[0]
  expect(two.channels).toBe(11)
  expect(two.ledCount).toBe(2)
  // Globals slide down behind the LED block: intensity (mode channel 12) lands at offset 6.
  expect(modeChannelOffset(bar.modes[0], 12, 2)).toBe(6)
  // LED channels past the chosen count do not exist.
  expect(modeChannelOffset(bar.modes[0], 6, 2)).toBeNull()
  expect(modeChannelOffset(bar.modes[0], 6, 4)).toBe(6)
  // The channel map follows the remap: no red3/red4 at 2 LEDs, intensity at 6.
  const map = fixtureChannelMap(two)
  expect(map.intensity).toBe(6)
  expect(map.red).toBe(0)
  expect(map.red3).toBeUndefined()
  expect(map.red4).toBeUndefined()
  // Beams (cells) are limited to the chosen LED count.
  expect(fixtureBeams(two).map((beam) => beam.id)).toEqual(['cell-1', 'cell-2'])
  expect(() => allocateFixtures([], bar, { quantity: 1, start: 1, ledCount: 5 })).toThrow('1–4 LEDs')
  // The default LED count is not stored.
  expect(allocateFixtures([], bar, { quantity: 1, start: 1 })[0].ledCount).toBeUndefined()
})

it('opens the patch options dialog on profile drop instead of patching immediately', () => {
  const panel = readFileSync('src/renderer/src/components/PatchPanel.tsx', 'utf8')
  expect(panel).toContain('setPatchDialog({ profile: dragged.profile')
  expect(panel).toContain('<PatchDialog')
  expect(panel).not.toContain('addProfileFixtures(dragged.profile, { quantity: 1')
  const dialog = readFileSync('src/renderer/src/components/PatchDialog.tsx', 'utf8')
  expect(dialog).toContain('aria-label="Fixture mode"')
  expect(dialog).toContain('label="Start at"')
  expect(dialog).toContain('aria-label="Short name"')
  expect(dialog).toContain('label="Count"')
  expect(dialog).toContain('label="Patch consecutive fixtures"')
  expect(dialog).toContain('label="LEDs"')
  expect(dialog).toContain('>Patch<')
  expect(dialog).toContain('placementError')
  expect(dialog).toContain('allocateFixtures')
})

it('shows short names in the Preview and gives each Count instance its own position', () => {
  const preview = readFileSync('src/renderer/src/components/StagePreview.tsx', 'utf8')
  expect(preview).toContain('f.shortName ?? f.name')
  expect(preview).toContain('instancePositions(f)')
  expect(preview).toContain('instanceKey(f.id, instance)')
  expect(preview).toContain('setFixtureInstancePositions')
  expect(preview).toContain('fixture-appear')
  expect(preview).not.toContain('f.pos.x + instance * 28')
  expect(preview).toContain('fixtureBeams(f)')
})
