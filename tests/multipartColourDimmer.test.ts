// Multipart colour + dimmer across ALL beams (Jake, 19 Nov 2026 —
// batch 3 follow-ups to the linked wheel, commit c4880ed). Three
// beam-1-only gaps, all still open before this batch:
//
// 1. Preset colour: a preset holding a bare colour (red/green/blue)
//    only lit beam 1 of a multipart fixture when the cue referencing
//    it resolved, and editing a preset through the wheel wrote bare
//    RGB into the preset. Both paths now fan the colour out to every
//    beam (explicit per-beam values still win).
// 2. White/Amber/UV sliders: the sliders beside the wheel read beam
//    1 only and wrote beam 1 only. They now read the average across
//    the beams (like the wheel's linkedValueFor) and write every beam.
// 3. Virtual/master dimmer: DIMMER_ATTRIBUTES listed the built-in
//    "red2" spelling but not the OFL "red 2" spelling, so the virtual
//    dimmer and the master fader left beams 2-4 unscaled on OFL
//    multipart fixtures. Dimmer attributes are now matched by base
//    name + optional pod number, either spelling.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCue, resolveCueValues } from '../src/shared/cueResolution'
import { importOflFixture } from '../src/shared/oflFixtureFormat'
import { fixtureBeams } from '../src/shared/fixtureProfiles'
import { computeCueChannels, isDimmerAttribute } from '../src/renderer/src/lib/automationRuntime'
import { useShowStore, findInlineCue } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { CueDef, FixtureDef, FixtureProfile, PresetDef } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url))

function loadOfl(file: string) {
  const manufacturers = JSON.parse(readFileSync(join(fixturesDir, 'manufacturers.json'), 'utf8')) as Record<string, { name?: string }>
  const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  const manufacturerKey = typeof raw.manufacturerKey === 'string' ? raw.manufacturerKey : basename(dirname(join(fixturesDir, file)))
  const fixtureKey = typeof raw.fixtureKey === 'string' ? raw.fixtureKey : basename(file, '.json')
  return importOflFixture(raw, { manufacturerKey, manufacturer: manufacturers[manufacturerKey]?.name, fixtureKey, preserveSource: false })
}

const bar4 = loadOfl('chauvet-dj/4bar.json')
const q5 = loadOfl('chauvet-dj/fxarray-q5.json')

function barFixture(id = 'bar4', channelStart = 1): FixtureDef {
  return { id, name: '4Bar', type: 'led-wash', channelStart, channels: 15, profile: bar4, modeId: bar4.modes[0].id }
}

function q5Fixture(id = 'q5', channelStart = 1): FixtureDef {
  return { id, name: 'Q5', type: 'led-wash', channelStart, channels: 30, profile: q5, modeId: q5.modes[0].id }
}

/** A synthetic OFL-style multipart fixture: the "red 2" spelling, no
 *  dimmer channel — the shape the OFL import produces (uniqueAttribute
 *  in oflFixtureFormat.ts) for a fixture with no Dimmer channel. Two
 *  RGBW pods, so the virtual dimmer has more than beam 1 to scale. */
function oflBarFixture(id = 'oflbar', channelStart = 1): FixtureDef {
  const channels = (['red', 'green', 'blue', 'white', 'red 2', 'green 2', 'blue 2', 'white 2'] as const).map((attribute, number) => ({
    number, attribute, propertyType: 'color' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 255
  }))
  const profile: FixtureProfile = {
    id: 'ofl-bar', name: 'OFL Bar', manufacturer: 'Test', legacyType: 'led-wash',
    modes: [{
      id: 'default', name: 'Default mode', channels,
      beams: [
        { id: 'cell-1', name: 'Cell 1', properties: { red: 'red', green: 'green', blue: 'blue', white: 'white' } },
        { id: 'cell-2', name: 'Cell 2', properties: { red: 'red 2', green: 'green 2', blue: 'blue 2', white: 'white 2' } }
      ]
    }]
  }
  return { id, name: 'OFL Bar', type: 'led-wash', channelStart, channels: 8, profile, modeId: 'default' }
}

/** Same shape in CMY + lime, no dimmer channel. */
function oflCmyFixture(id = 'oflcmy', channelStart = 1): FixtureDef {
  const channels = (['cyan', 'magenta', 'yellow', 'lime', 'cyan 2', 'magenta 2', 'yellow 2', 'lime 2'] as const).map((attribute, number) => ({
    number, attribute, propertyType: 'color' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 255
  }))
  const profile: FixtureProfile = {
    id: 'ofl-cmy', name: 'OFL CMY', manufacturer: 'Test', legacyType: 'led-wash',
    modes: [{
      id: 'default', name: 'Default mode', channels,
      beams: [
        { id: 'cell-1', name: 'Cell 1', properties: { cyan: 'cyan', magenta: 'magenta', yellow: 'yellow', lime: 'lime' } },
        { id: 'cell-2', name: 'Cell 2', properties: { cyan: 'cyan 2', magenta: 'magenta 2', yellow: 'yellow 2', lime: 'lime 2' } }
      ]
    }]
  }
  return { id, name: 'OFL CMY', type: 'led-wash', channelStart, channels: 8, profile, modeId: 'default' }
}

// The seeded cue, read through its holder (Jake, 27 Nov 2026 —
// inline cues: there is no project-wide `cues` slice any more).
const cue1 = () => {
  const state = useShowStore.getState()
  return findInlineCue(state.show, state.cueLists, 'c1')!.cue
}

// A cue survives migration only in a holder: the seed button carries
// it. A fresh object per seed — migrateShow shallow-copies its input
// and writes the inlined cue onto the button.
const cuePage = () => ({ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', cueId: 'c1', presetIds: [] }] })

const RED_PRESET: PresetDef = { id: 'p', name: 'Red', category: 'color', fixtureValues: { bar4: { red: 255, green: 0, blue: 0 } } }

function cueWithPreset(presetIds: string[] = ['p'], fixtureValues: CueDef['fixtureValues'] = {}): CueDef {
  return { id: 'c1', name: 'Cue 1', presetIds, sequenceIds: [], fixtureValues, fadeMs: 0 }
}

describe('preset colour fans out to every beam', () => {
  it('a beam-1-only red preset colours all four 4Bar cells when the cue resolves', () => {
    const fixture = barFixture()
    expect(fixtureBeams(fixture)).toHaveLength(4)
    const resolved = resolveCueValues(cueWithPreset(), [RED_PRESET], [fixture])
    expect(resolved.bar4).toEqual({
      red: 255, green: 0, blue: 0,
      'red 2': 255, 'green 2': 0, 'blue 2': 0,
      'red 3': 255, 'green 3': 0, 'blue 3': 0,
      'red 4': 255, 'green 4': 0, 'blue 4': 0
    })
  })

  it('a red preset colours all five Q5 pods, and invents no UV', () => {
    const fixture = q5Fixture()
    expect(fixtureBeams(fixture)).toHaveLength(5)
    const preset: PresetDef = { id: 'p', name: 'Red', category: 'color', fixtureValues: { q5: { red: 255, green: 0, blue: 0 } } }
    const resolved = resolveCueValues(cueWithPreset(), [preset], [fixture])
    expect(resolved.q5).toMatchObject({ red: 255, 'red 2': 255, 'red 3': 255, 'red 4': 255, 'red 5': 255 })
    expect(resolved.q5).not.toHaveProperty('uv')
    expect(resolved.q5).not.toHaveProperty('uv 2')
  })

  it('an explicit per-beam value in the preset still wins over the fan-out', () => {
    const fixture = barFixture()
    const preset: PresetDef = { id: 'p', name: 'Red', category: 'color', fixtureValues: { bar4: { red: 255, green: 0, blue: 0, 'red 2': 10, 'green 2': 20 } } }
    const resolved = resolveCueValues(cueWithPreset(), [preset], [fixture])
    expect(resolved.bar4).toMatchObject({ red: 255, 'red 2': 10, 'green 2': 20, 'red 3': 255, 'red 4': 255 })
  })

  it('ad-hoc cue values are NOT fanned — only preset colour is', () => {
    // The operator's own per-fixture values stay exactly as written;
    // the wheel already fans ad-hoc writes itself, so resolution must
    // not invent beam values the cue never programmed.
    const fixture = barFixture()
    const resolved = resolveCueValues(cueWithPreset([], { bar4: { red: 100 } }), [], [fixture])
    expect(resolved.bar4).toEqual({ red: 100 })
  })

  it('a single-cell fixture is unchanged — no numbered channels appear', () => {
    const wash: FixtureDef = { id: 'w', name: 'Wash', type: 'led-wash', channelStart: 1, channels: 7 }
    const preset: PresetDef = { id: 'p', name: 'Red', category: 'color', fixtureValues: { w: { red: 255, green: 0, blue: 0 } } }
    expect(resolveCueValues(cueWithPreset(), [preset], [wash]).w).toEqual({ red: 255, green: 0, blue: 0 })
  })

  it('a red preset on a 4Bar lights all four cells in the DMX output', () => {
    const fixture = barFixture()
    // 4Bar 15ch at channel 1: dimmer ch2, red ch4, red 2 ch7,
    // red 3 ch10, red 4 ch13.
    const cue = cueWithPreset(['p'], { bar4: { intensity: 255 } })
    const patch = computeCueChannels([fixture], resolveCue(cue, [RED_PRESET], [fixture]), 255)
    expect(patch).toMatchObject({ 2: 255, 4: 255, 7: 255, 10: 255, 13: 255 })
  })

  it('editing a preset through the wheel stores the colour on every beam', () => {
    const s = () => useShowStore.getState()
    const fixture = barFixture()
    s().setShow(migrateShow({
      fixtures: [fixture],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { bar4: { intensity: 255, red: 0, green: 255, blue: 0 } } }],
      livePages: [cuePage()],
      presets: [{ id: 'p', name: 'Red', category: 'color', fixtureValues: { bar4: { intensity: 255 } } }]
    }))
    s().activateCue('c1')
    s().startEditingPreset('p')
    s().updateEditingPresetValues({ red: 255, green: 0, blue: 0 })
    expect(s().presets[0].fixtureValues.bar4).toEqual({
      intensity: 255,
      red: 255, green: 0, blue: 0,
      'red 2': 255, 'green 2': 0, 'blue 2': 0,
      'red 3': 255, 'green 3': 0, 'blue 3': 0,
      'red 4': 255, 'green 4': 0, 'blue 4': 0
    })
  })

  it('capturing a colour preset from a 4Bar look keeps every beam', () => {
    const s = () => useShowStore.getState()
    const fixture = barFixture()
    const allRed = {
      intensity: 255, red: 255, green: 0, blue: 0,
      'red 2': 255, 'green 2': 0, 'blue 2': 0,
      'red 3': 255, 'green 3': 0, 'blue 3': 0,
      'red 4': 255, 'green 4': 0, 'blue 4': 0
    }
    s().setShow(migrateShow({
      fixtures: [fixture],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { bar4: allRed } }],
      livePages: [cuePage()],
    }))
    s().activateCue('c1')
    s().selectFixtures(['bar4'])
    s().capturePreset('Red', 'color')
    expect(s().presets[0].fixtureValues.bar4).toMatchObject({
      red: 255, 'red 2': 255, 'red 3': 255, 'red 4': 255,
      green: 0, 'green 2': 0, 'green 3': 0, 'green 4': 0
    })
  })

  it('updating a preset from the current look keeps every beam', () => {
    const s = () => useShowStore.getState()
    const fixture = barFixture()
    const allRed = {
      intensity: 255, red: 255, green: 0, blue: 0,
      'red 2': 255, 'green 2': 0, 'blue 2': 0,
      'red 3': 255, 'green 3': 0, 'blue 3': 0,
      'red 4': 255, 'green 4': 0, 'blue 4': 0
    }
    s().setShow(migrateShow({
      fixtures: [fixture],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { bar4: allRed } }],
      livePages: [cuePage()],
      presets: [{ id: 'p', name: 'Red', category: 'color', fixtureValues: { bar4: { red: 1 } } }]
    }))
    s().activateCue('c1')
    s().selectFixtures(['bar4'])
    s().updatePresetFromCurrent('p')
    expect(s().presets[0].fixtureValues.bar4).toMatchObject({
      red: 255, 'red 2': 255, 'red 3': 255, 'red 4': 255
    })
  })
})

describe('White/Amber/UV sliders write every beam', () => {
  it('a White write to a two-pod OFL bar lands on both pods', () => {
    const s = () => useShowStore.getState()
    const fixture = oflBarFixture()
    s().setShow(migrateShow({
      fixtures: [fixture],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { oflbar: { intensity: 255 } } }],
      livePages: [cuePage()],
    }))
    s().activateCue('c1')
    s().selectFixtures(['oflbar'])
    s().updateSelectedFixtures({ white: 128 })
    expect(cue1().fixtureValues.oflbar).toMatchObject({ white: 128, 'white 2': 128 })
  })

  it('a UV write to the Q5 lands on all five pods', () => {
    const s = () => useShowStore.getState()
    const fixture = q5Fixture()
    s().setShow(migrateShow({
      fixtures: [fixture],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { q5: { intensity: 255 } } }],
      livePages: [cuePage()],
    }))
    s().activateCue('c1')
    s().selectFixtures(['q5'])
    s().updateSelectedFixtures({ uv: 200 })
    expect(cue1().fixtureValues.q5).toMatchObject({ uv: 200, 'uv 2': 200, 'uv 3': 200, 'uv 4': 200, 'uv 5': 200 })
  })

  it('a White write while editing a preset lands on every beam of the preset', () => {
    const s = () => useShowStore.getState()
    const fixture = oflBarFixture()
    s().setShow(migrateShow({
      fixtures: [fixture],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { oflbar: { intensity: 255 } } }],
      livePages: [cuePage()],
      presets: [{ id: 'p', name: 'White', category: 'color', fixtureValues: { oflbar: { intensity: 255 } } }]
    }))
    s().activateCue('c1')
    s().startEditingPreset('p')
    s().updateEditingPresetValues({ white: 90 })
    expect(s().presets[0].fixtureValues.oflbar).toMatchObject({ white: 90, 'white 2': 90 })
  })

  it('a fixture-level White write re-links a separated beam — and a patch naming the beam wins', () => {
    const s = () => useShowStore.getState()
    const fixture = oflBarFixture()
    s().setShow(migrateShow({
      fixtures: [fixture],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { oflbar: { intensity: 255, 'white 2': 10 } } }],
      livePages: [cuePage()],
    }))
    s().activateCue('c1')
    s().selectFixtures(['oflbar'])
    // Pod 2 was separated at 10; moving the fixture-level White
    // slider re-links it, like the wheel re-links a separated beam.
    s().updateSelectedFixtures({ white: 128 })
    expect(cue1().fixtureValues.oflbar).toMatchObject({ white: 128, 'white 2': 128 })
    // But a write that already names the beam keeps it: the fan-out
    // only fills keys the patch does not carry.
    s().updateSelectedFixtures({ white: 200, 'white 2': 10 })
    expect(cue1().fixtureValues.oflbar).toMatchObject({ white: 200, 'white 2': 10 })
  })
})

describe('virtual + master dimmer scale every beam (OFL spelling)', () => {
  it('matches dimmer attributes by base name + pod number, either spelling', () => {
    for (const attr of ['intensity', 'red', 'green', 'blue', 'white', 'amber', 'uv', 'lime', 'cyan', 'magenta', 'yellow',
      'red2', 'green3', 'blue4', 'white2', 'amber2', 'uv5', 'lime2', 'cyan3',
      'red 2', 'green 3', 'blue 4', 'white 2', 'amber 2', 'uv 5', 'lime 2', 'cyan 3', 'red 10']) {
      expect(isDimmerAttribute(attr)).toBe(true)
    }
    for (const attr of ['strobe', 'pan', 'tilt', 'function', 'speed', 'reddish', 'red 2 fine', 'intensity2x', '']) {
      expect(isDimmerAttribute(attr)).toBe(false)
    }
  })

  it('the virtual dimmer scales both pods of an OFL-spelling bar with no dimmer channel', () => {
    const fixture = oflBarFixture()
    const cue = {
      id: 's', name: 'Cue', fadeMs: 0,
      fixtureValues: { oflbar: { intensity: 128, red: 255, green: 0, blue: 0, white: 255, 'red 2': 255, 'green 2': 0, 'blue 2': 0, 'white 2': 255 } }
    }
    // Offsets: red ch1, white ch4, red 2 ch5, white 2 ch8.
    expect(computeCueChannels([fixture], cue, 255, false)).toMatchObject({ 1: 128, 4: 128, 5: 128, 8: 128 })
  })

  it('the virtual dimmer scales CMY and lime pods too', () => {
    const fixture = oflCmyFixture()
    const cue = {
      id: 's', name: 'Cue', fadeMs: 0,
      fixtureValues: { oflcmy: { intensity: 128, cyan: 200, magenta: 100, yellow: 0, lime: 255, 'cyan 2': 200, 'magenta 2': 100, 'yellow 2': 0, 'lime 2': 255 } }
    }
    // 200 at half dimmer is 100; lime 255 at half is 128 — both pods.
    expect(computeCueChannels([fixture], cue, 255, false)).toMatchObject({ 1: 100, 2: 50, 4: 128, 5: 100, 6: 50, 8: 128 })
  })

  it('the master fader scales every beam of a real OFL 4Bar', () => {
    const fixture = barFixture()
    const cue = {
      id: 's', name: 'Cue', fadeMs: 0,
      fixtureValues: {
        bar4: {
          intensity: 255, red: 255, green: 0, blue: 0,
          'red 2': 255, 'green 2': 0, 'blue 2': 0,
          'red 3': 255, 'green 3': 0, 'blue 3': 0,
          'red 4': 255, 'green 4': 0, 'blue 4': 0
        }
      }
    }
    // Red cells on DMX 4, 7, 10, 13 — all at half master.
    expect(computeCueChannels([fixture], cue, 128, false)).toMatchObject({ 2: 128, 4: 128, 7: 128, 10: 128, 13: 128 })
  })

  it('the master fader still scales the built-in PAN bar (red2 spelling)', () => {
    const pan: FixtureDef = { id: 'bar', name: 'PAN 4x1x30', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 }
    const cue = {
      id: 's', name: 'Cue', fadeMs: 0,
      fixtureValues: {
        bar: {
          intensity: 255, red: 255, green: 0, blue: 0,
          red2: 255, green2: 0, blue2: 0,
          red3: 255, green3: 0, blue3: 0,
          red4: 255, green4: 0, blue4: 0
        }
      }
    }
    // PAN RGB offsets 0/3/6/9 — DMX 1, 4, 7, 10.
    expect(computeCueChannels([pan], cue, 128, false)).toMatchObject({ 1: 128, 4: 128, 7: 128, 10: 128 })
  })
})
