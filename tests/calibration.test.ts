import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importOflFixture } from '../src/shared/oflFixtureFormat'
import {
  applyCalibrationOutput,
  calibrationStepPatch,
  calibrationSteps,
  channelToDegrees,
  compassToPreviewDirection,
  defaultHomeValues,
  degreesToChannel,
  isCalibrationComplete,
  panTiltRange,
  withCalibrationStep,
  wrapRotationDegrees
} from '../src/renderer/src/lib/calibration'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { FixtureDef } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url))

function loadOfl(file: string) {
  const manufacturers = JSON.parse(readFileSync(join(fixturesDir, 'manufacturers.json'), 'utf8')) as Record<string, { name?: string }>
  const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  const manufacturerKey = typeof raw.manufacturerKey === 'string' ? raw.manufacturerKey : basename(dirname(join(fixturesDir, file)))
  const fixtureKey = typeof raw.fixtureKey === 'string' ? raw.fixtureKey : basename(file, '.json')
  return importOflFixture(raw, { manufacturerKey, manufacturer: manufacturers[manufacturerKey]?.name, fixtureKey, preserveSource: false })
}

// Built-in moving head: intensity 0, pan 1, tilt 2 (offsets); no profile
// range, so the 540°/270° defaults apply.
function head(id = 'mh1', channelStart = 1, calibration?: FixtureDef['calibration']): FixtureDef {
  return { id, name: 'MH1', type: 'moving-head', channelStart, channels: 8, ...(calibration ? { calibration } : {}) }
}
// Static light: no pan/tilt channels.
function par(id = 'par1', channelStart = 9): FixtureDef {
  return { id, name: 'PAR1', type: 'par', channelStart, channels: 4 }
}

describe('pan/tilt ranges from the profile (Piece 4)', () => {
  it('captures the Rogue R3 Spot ranges from its OFL capabilities', () => {
    const r3 = loadOfl('chauvet-professional/rogue-r3-spot.json')
    expect(r3.modes[0].panRange).toBe(540)
    expect(r3.modes[0].tiltRange).toBe(250)
  })

  it('defaults to 540° pan / 270° tilt when the profile carries no range', () => {
    expect(panTiltRange(head())).toEqual({ pan: 540, tilt: 270 })
    const r3 = loadOfl('chauvet-professional/rogue-r3-spot.json')
    expect(panTiltRange({ id: 'r3', name: 'R3', type: 'moving-head', channelStart: 1, channels: 25, profile: r3, modeId: r3.modes[0].id })).toEqual({ pan: 540, tilt: 250 })
  })
})

describe('degrees ↔ channel values (Piece 4)', () => {
  it('maps 0° to the centre of the range and the ends to 0 / 255', () => {
    expect(degreesToChannel(540, 0)).toBe(128)
    expect(degreesToChannel(540, 270)).toBe(255)
    expect(degreesToChannel(540, -270)).toBe(0)
    expect(degreesToChannel(540, 300)).toBe(255) // clamped to the range
    expect(degreesToChannel(540, -300)).toBe(0)
    expect(channelToDegrees(540, 128)).toBeCloseTo(1.06, 1)
    expect(channelToDegrees(540, 0)).toBe(-270)
    expect(channelToDegrees(540, 255)).toBe(270)
  })

  it('converts compass directions to Preview beam rotations', () => {
    // The Preview beam points down at 0°; compass 0° (up) is 180°.
    expect(compassToPreviewDirection(0)).toBe(180)
    expect(compassToPreviewDirection(90)).toBe(270)
    expect(compassToPreviewDirection(180)).toBe(0)
    expect(compassToPreviewDirection(270)).toBe(90)
  })
})

describe('calibration steps and completion (Piece 4)', () => {
  it('gives a moving head all four steps and a static light only Home', () => {
    expect(calibrationSteps(head())).toEqual(['home', 'rotation', 'limits', 'perspective'])
    expect(calibrationSteps(par())).toEqual(['home'])
  })

  it('is complete when a home direction and a perspective are chosen', () => {
    expect(isCalibrationComplete(head())).toBe(false)
    expect(isCalibrationComplete(head('mh1', 1, { homeDirection: 90 }))).toBe(false)
    expect(isCalibrationComplete(head('mh1', 1, { homeDirection: 90, perspective: 'down' }))).toBe(true)
    // A static light only needs its direction.
    expect(isCalibrationComplete(par('par1', 9))).toBe(false)
    expect(isCalibrationComplete({ ...par('par1', 9), calibration: { homeDirection: 180 } })).toBe(true)
  })

  it('merges each step into the stored calibration', () => {
    const fixture = head('mh1', 1, { homeDirection: 10 })
    expect(withCalibrationStep(fixture, 'rotation', { rotationReversed: true })).toEqual({ homeDirection: 10, rotationReversed: true })
    expect(withCalibrationStep(fixture, 'limits', { panMin: -90, panMax: 90 })).toEqual({ homeDirection: 10, panMin: -90, panMax: 90 })
    expect(withCalibrationStep(fixture, 'perspective', { perspective: 'parallel' })).toEqual({ homeDirection: 10, perspective: 'parallel' })
  })
})

describe('home position and live calibration output (Piece 4)', () => {
  it('homes to pan centre, tilt 90°, dimmer full', () => {
    expect(defaultHomeValues(head())).toEqual({ pan: 128, tilt: 212, intensity: 255 })
  })

  it('sends the home position on the Home and Limits steps', () => {
    // Built-in head at channelStart 1: pan DMX 2, tilt DMX 3, dimmer DMX 1.
    expect(calibrationStepPatch([head()], 'home')).toEqual({ 1: 255, 2: 128, 3: 212 })
    expect(calibrationStepPatch([head()], 'limits')).toEqual({ 1: 255, 2: 128, 3: 212 })
  })

  it('holds the centre of the pan and tilt ranges on the Perspective step', () => {
    expect(calibrationStepPatch([head()], 'perspective')).toEqual({ 1: 255, 2: 128, 3: 128 })
  })

  it('sweeps the pan on the Rotation step, with an optional blackout', () => {
    // The dialog no longer uses the blackout (the sweep scrolls
    // forever now — see wrapRotationDegrees below); the patch still
    // honours the flag when asked.
    expect(calibrationStepPatch([head()], 'rotation', 30, false)).toEqual({ 1: 255, 2: 142, 3: 212 })
    expect(calibrationStepPatch([head()], 'rotation', -45, true)).toEqual({ 1: 0, 2: 106, 3: 212 })
  })

  it('wraps a continuously scrolling rotation angle into the pan range', () => {
    // Jake, 26 Nov 2026: LightKey's Rotation arrow scrolls around the
    // dial forever. The wrap is modulo min(range, 360) so the beam
    // keeps turning with the arrow: for a 540° head the angle wraps
    // at ±180° (the same dial point), never at the ±270° range ends.
    expect(wrapRotationDegrees(540, 0)).toBe(0)
    expect(wrapRotationDegrees(540, 180)).toBe(-180)
    expect(wrapRotationDegrees(540, 270)).toBe(-90)
    expect(wrapRotationDegrees(540, -270)).toBe(90)
    expect(wrapRotationDegrees(540, 360)).toBe(0)
    expect(wrapRotationDegrees(540, 720)).toBe(0)
    expect(wrapRotationDegrees(540, -540)).toBe(-180)
    // A fixture whose range is under 360° wraps at its range ends.
    expect(wrapRotationDegrees(180, 90)).toBe(-90)
    expect(wrapRotationDegrees(180, 100)).toBe(-80)
    expect(wrapRotationDegrees(180, -100)).toBe(80)
  })
})

describe('limit clamping and rotation mirroring on output (Piece 4)', () => {
  it('clamps pan and tilt to the calibrated limits', () => {
    const fixture = head('mh1', 1, { panMin: -90, panMax: 90, tiltMin: -45, tiltMax: 45 })
    // Pan +180° (213) clamps to +90° (170); tilt +90° (213) clamps to +45° (170).
    expect(applyCalibrationOutput({ 2: 213, 3: 213 }, [fixture])).toEqual({ 2: 170, 3: 170 })
    // Inside the limits, values pass through unchanged.
    expect(applyCalibrationOutput({ 2: 128, 3: 128 }, [fixture])).toEqual({ 2: 128, 3: 128 })
  })

  it('mirrors pan for a reversed yoke, after clamping', () => {
    const fixture = head('mh1', 1, { panMin: -90, panMax: 90, rotationReversed: true })
    // +180° clamps to +90°, then mirrors to −90° (85).
    expect(applyCalibrationOutput({ 2: 213 }, [fixture])).toEqual({ 2: 85 })
    // +45° (149) mirrors to −45° (106).
    expect(applyCalibrationOutput({ 2: 149 }, [fixture])).toEqual({ 2: 106 })
  })

  it('leaves uncalibrated fixtures and absent channels untouched', () => {
    expect(applyCalibrationOutput({ 2: 213, 3: 213, 9: 200 }, [head(), par()])).toEqual({ 2: 213, 3: 213, 9: 200 })
    // A fixture with only limits set still clamps; one with no calibration does not.
    expect(applyCalibrationOutput({ 2: 213 }, [head('mh1', 1, { panMax: 0 })])).toEqual({ 2: 128 })
  })
})

describe('calibration persistence and group calibration (Piece 4)', () => {
  it('survives a show migration and applies to a whole group at once', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [head('mh1', 1), head('mh2', 9), par('par1', 17)], cues: [] }))
    const calibration = { homeDirection: 90, rotationReversed: true, panMin: -90, panMax: 90, tiltMin: -45, tiltMax: 45, perspective: 'down' as const }
    state().beginHistoryGroup()
    for (const id of ['mh1', 'mh2']) state().updateFixture(id, { calibration })
    state().endHistoryGroup()
    const fixtures = state().show!.fixtures
    expect(fixtures[0].calibration).toEqual(calibration)
    expect(fixtures[1].calibration).toEqual(calibration)
    expect(fixtures[2].calibration).toBeUndefined()
    expect(isCalibrationComplete(fixtures[0])).toBe(true)
    expect(isCalibrationComplete(fixtures[1])).toBe(true)
    // The stored show round-trips through migration with calibration intact.
    const migrated = migrateShow(JSON.parse(JSON.stringify(state().show)))
    expect(migrated.fixtures[0].calibration).toEqual(calibration)
  })
})
