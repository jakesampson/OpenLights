// Jake, 20 Nov 2026 (screenshots image-20/21, project "PRBC Default"):
// Q3 stays dark on first load with the Dimmer at 100% and the wheel
// showing blue; clicking the wheel wakes it up. The 5b43666 heal
// (migrateShow + OFL library) was supposed to fix this by backfilling
// stale blue defaults — these tests pin down, against the REAL Q5
// profile, when the heal works and when it silently misses.
import { describe, it, expect } from 'vitest'
// The Q5 JSON lives in tests/fixtures now: the bundled fixtures/ folder
// was removed 20 Nov 2026 (Jake does not want the OFL library shipped),
// and the Q5 is one of the authored fixtures that went with it. This
// copy is test data only — it never ships — and keeps the heal pinned
// against the real profile it was written for.
import { readFileSync } from 'node:fs'
import { importOflFixture, mergeOflLibraries } from '../src/shared/oflFixtureFormat'
import { migrateShow } from '../src/shared/migrations'
import { defaultFixtureValues } from '../src/renderer/src/stores/showStore'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import type { FixtureProfile, ShowDef } from '../src/shared/types'

// The library profile exactly as loadOflFolder builds it (main process).
const libraryQ5 = (): FixtureProfile =>
  importOflFixture(readFileSync('tests/fixtures/chauvet-dj/fxarray-q5.json', 'utf-8'), {
    manufacturerKey: 'chauvet-dj',
    manufacturer: 'Chauvet DJ',
    fixtureKey: 'fxarray-q5',
    preserveSource: false
  })

// The snapshot patching stored before Piece 11: same profile, but the
// import then had no blue-255 default rule, so every blue channel is 0.
const staleQ5Snapshot = (): FixtureProfile => {
  const profile = structuredClone(libraryQ5())
  for (const mode of profile.modes) {
    for (const channel of mode.channels) {
      if (/^blue/.test(channel.attribute)) channel.defaultValue = 0
    }
  }
  return profile
}

const q3Show = (overrides: { profileId?: string; modeId?: string; snapshot?: FixtureProfile } = {}): ShowDef =>
  ({
    fixtures: [
      {
        id: 'q3',
        name: 'Q3',
        shortName: 'Q3',
        type: 'par',
        profileId: overrides.profileId ?? 'ofl:chauvet-dj:fxarray-q5',
        modeId: overrides.modeId ?? '30ch',
        channelStart: 1,
        channels: 30,
        profile: overrides.snapshot ?? staleQ5Snapshot()
      }
    ],
    cues: []
  }) as unknown as ShowDef

const blueDefaultsOf = (show: ShowDef): Record<string, number> => {
  const values = defaultFixtureValues(show.fixtures[0])
  return Object.fromEntries(Object.entries(values).filter(([attr]) => /^blue/.test(attr)))
}

describe('Q3 first load — the 5b43666 heal against the real Q5 profile', () => {
  it('heals a stale Q5 snapshot when the OFL library is handed to the migration', () => {
    const healed = migrateShow(q3Show(), [libraryQ5()])
    expect(blueDefaultsOf(healed)).toEqual({
      blue: 255,
      'blue 2': 255,
      'blue 3': 255,
      'blue 4': 255,
      'blue 5': 255
    })
  })

  it('does NOT heal when the migration runs without the OFL library (the main-process load path)', () => {
    const healed = migrateShow(q3Show())
    expect(blueDefaultsOf(healed)).toEqual({
      blue: 0,
      'blue 2': 0,
      'blue 3': 0,
      'blue 4': 0,
      'blue 5': 0
    })
  })

  it('heals a snapshot whose id came from a no-options import, via its stored OFL identity', () => {
    // importOflFixture used to ignore the file's own keys, so a snapshot
    // imported without options carries ofl:open-fixture-library:fxarray-q5
    // — an id no library profile has. Its stored `ofl` field still names
    // the definition it came from, so the heal matches on that instead.
    const wrongId = structuredClone(staleQ5Snapshot())
    wrongId.id = 'ofl:open-fixture-library:fxarray-q5'
    const healed = migrateShow(q3Show({ profileId: 'ofl:open-fixture-library:fxarray-q5', snapshot: wrongId }), [libraryQ5()])
    expect(blueDefaultsOf(healed).blue).toBe(255)
  })

  it('heals a snapshot whose stored OFL manufacturer key is the old placeholder', () => {
    // Exactly what the old no-options import stored: id and ofl field
    // both carry 'open-fixture-library' as the manufacturer.
    const legacy = structuredClone(staleQ5Snapshot())
    legacy.id = 'ofl:open-fixture-library:fxarray-q5'
    legacy.ofl = { manufacturerKey: 'open-fixture-library', fixtureKey: 'fxarray-q5' }
    const healed = migrateShow(q3Show({ profileId: 'ofl:open-fixture-library:fxarray-q5', snapshot: legacy }), [libraryQ5()])
    expect(blueDefaultsOf(healed).blue).toBe(255)
  })

  it('a no-options import now carries the file\u2019s own manufacturer and fixture keys', () => {
    const imported = importOflFixture(readFileSync('tests/fixtures/chauvet-dj/fxarray-q5.json', 'utf-8'), { preserveSource: false })
    expect(imported.id).toBe('ofl:chauvet-dj:fxarray-q5')
    expect(imported.ofl?.manufacturerKey).toBe('chauvet-dj')
    expect(imported.ofl?.fixtureKey).toBe('fxarray-q5')
  })

  it('a healed Q5 composes a lit frame from a Dimmer-only override', () => {
    const healed = migrateShow(q3Show(), [libraryQ5()])
    const fixture = healed.fixtures[0]
    const frame = computeCueChannels(
      [fixture],
      { id: 'manual', name: 'Manual', fadeMs: 0, fixtureValues: { q3: { intensity: 255 } } },
      255,
      true
    )
    // 30ch mode (0-based channel numbers): ch2 intensity, ch3 red,
    // ch4 green, ch5 blue — with channelStart 1 those are DMX 3, 4, 5, 6.
    const blueChannel = fixture.channelStart + 5
    expect(frame[blueChannel]).toBe(255)
    expect(frame[fixture.channelStart + 3]).toBe(0)
    expect(frame[fixture.channelStart + 4]).toBe(0)
  })
})

describe('Q3 first load — the OFL library delivery (main process)', () => {
  it('merges a fresh seed over the cache: fresh profiles win, cached-only profiles are kept', () => {
    const fresh = [libraryQ5()]
    const cachedOnly = structuredClone(libraryQ5())
    cachedOnly.id = 'ofl:hand-imported:extra'
    cachedOnly.name = 'Hand imported extra'
    const staleCachedQ5 = structuredClone(staleQ5Snapshot())
    const merged = mergeOflLibraries(fresh, [staleCachedQ5, cachedOnly])
    expect(merged.map((p) => p.id)).toEqual(['ofl:chauvet-dj:fxarray-q5', 'ofl:hand-imported:extra'])
    // The fresh Q5 (blue 255), not the stale cached copy (blue 0).
    const q5 = merged.find((p) => p.id === 'ofl:chauvet-dj:fxarray-q5')!
    expect(q5.modes.find((m) => m.id === '30ch')!.channels.find((c) => c.attribute === 'blue')!.defaultValue).toBe(255)
  })

  it('wires the show loads through the current OFL library, and the library through the uploaded cache', () => {
    // The main process cannot be imported in vitest (it imports Electron),
    // so pin the wiring as text — the same pattern as the OFL importer
    // wiring test in oflFixtureFormat.test.ts. The fingerprint-checked
    // bundled cache is gone with the bundle (Jake, 20 Nov 2026): the
    // library is the uploaded cache, and a stale bundle-seeded cache is
    // cleared by shouldClearBundledOflCache.
    const main = readFileSync('src/main/index.ts', 'utf8')
    expect(main).toContain('migrateShow(JSON.parse(data), getOflLibrary())')
    expect(main).toContain("ipcMain.handle('ofl-library:list', () => getOflLibrary())")
    expect(main).toContain('shouldClearBundledOflCache')
    expect(main).toContain("ipcMain.handle('ofl-library:import-zip'")
    expect(main).not.toContain('bundledFixturesFingerprint')
    expect(main).not.toContain('bundledFixturesDir')
    // No load path that produces the opened show migrates without the
    // library any more. (list-shows still migrates its preview copy
    // without it — the preview only reads the schema version.)
    expect(main).not.toContain('migrateShow(JSON.parse(data))')
  })
})
