import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { allocateFixtures, findConflicts, fixtureWidth, placementError } from '../src/renderer/src/lib/patch'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
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
  expect(styles).toContain('min-height: 72px')
  expect(styles).toContain('-webkit-app-region: no-drag')
})

it('reports overlaps and address overflow without flagging adjacent spans', () => {
 const a = allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 2, start: 1 })
 expect(findConflicts(a)).toEqual([])
 expect(findConflicts([a[0], { ...a[1], channelStart: 3 }])[0]).toMatchObject({ type: 'overlap', channels: [3, 4] })
 expect(findConflicts([{ ...a[0], channelStart: 511 }])[0].type).toBe('out-of-range')
 expect(findConflicts([a[0], { ...a[1], channelStart: 1, universe: 2 }])).toEqual([])
})
