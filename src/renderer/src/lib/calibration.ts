import { fixtureChannelMap, fixtureMode } from '@shared/fixtureProfiles'
import type { CalibrationPerspective, FixtureCalibration, FixtureDef } from '@shared/types'

export type CalibrationStep = 'home' | 'rotation' | 'limits' | 'perspective'

/** The four steps of LightKey's Beam Direction dialog (Guide pp.58–60),
 *  in the order the left rail shows them, with the guide's own words. */
export const CALIBRATION_STEPS: { id: CalibrationStep; label: string; instruction: string }[] = [
  { id: 'home', label: 'Home', instruction: 'The fixture is at the center of its pan range.\n\nDrag the arrow until it points in the direction of the light beam.' },
  { id: 'rotation', label: 'Rotation', instruction: 'The arrow should follow the movement of the light beam.\n\nIf necessary, click inside the circle to reverse the direction.' },
  { id: 'limits', label: 'Limits', instruction: 'Drag the handles to limit the ranges for pan and tilt.' },
  { id: 'perspective', label: 'Perspective', instruction: 'The fixture is at the center of its tilt range.\n\nSelect the fixture\u2019s orientation in relation to the viewing direction.' }
]

/** The five Perspective choices in their cross-layout positions (Guide
 *  p.60): the top tile is "down" — a ceiling-hung fixture, head pointing
 *  down — the bottom tile is "up", and the centre tile is the beam
 *  running parallel to the viewing direction (towards/away from the
 *  viewer). */
export const CALIBRATION_PERSPECTIVES: { id: CalibrationPerspective; label: string; position: 'top' | 'left' | 'centre' | 'right' | 'bottom' }[] = [
  { id: 'down', label: 'Down', position: 'top' },
  { id: 'left', label: 'Left', position: 'left' },
  { id: 'parallel', label: 'Towards / away from viewer', position: 'centre' },
  { id: 'right', label: 'Right', position: 'right' },
  { id: 'up', label: 'Up', position: 'bottom' }
]

/** Pan/tilt ranges for a fixture, from its profile (Guide p.60: "This
 *  information is part of the fixture profile"). The defaults (540° pan,
 *  270° tilt) are the common moving-head ranges, used when the profile
 *  carries none — the built-in generic head has no range in its profile.
 *  An OFL fixture's ranges come from its Pan/Tilt capabilities. */
export function panTiltRange(fixture: FixtureDef): { pan: number; tilt: number } {
  const mode = fixtureMode(fixture)
  return { pan: mode?.panRange ?? 540, tilt: mode?.tiltRange ?? 270 }
}

/** Channel value (0–255) for an angle in degrees from the centre of the
 *  physical range — the home angle is always 0° (Guide p.91). */
export function degreesToChannel(range: number, degrees: number): number {
  const clamped = Math.max(-range / 2, Math.min(range / 2, degrees))
  return Math.round((clamped / range + 0.5) * 255)
}

/** Angle in degrees from the centre of the range for a channel value. */
export function channelToDegrees(range: number, value: number): number {
  return (Math.max(0, Math.min(255, value)) / 255 - 0.5) * range
}

/** The fixture's home position (Guide p.59): centre of the pan range,
 *  tilted 90°, dimmer full. */
export function defaultHomeValues(fixture: FixtureDef): { pan: number; tilt: number; intensity: number } {
  const { tilt } = panTiltRange(fixture)
  return { pan: 128, tilt: degreesToChannel(tilt, 90), intensity: 255 }
}

/** The Home cue's values for one fixture (Piece 5, wizard Go!): dimmer
 *  full, pan/tilt at home — but only the axes the fixture actually has, so
 *  a static light gets intensity only and no invented pan/tilt channels.
 *  Colour is left unset so the fixture's default colour applies (Piece 11). */
export function homeFixtureValues(fixture: FixtureDef): Record<string, number> {
  const map = fixtureChannelMap(fixture)
  const home = defaultHomeValues(fixture)
  const values: Record<string, number> = { intensity: home.intensity }
  if (map.pan !== undefined) values.pan = home.pan
  if (map.tilt !== undefined) values.tilt = home.tilt
  return values
}

/** Which calibration steps apply: a moving head gets all four; a static
 *  light (no pan channel) only has a beam direction to set (Guide p.60,
 *  "Calibrate the position of a static light"). */
export function calibrationSteps(fixture: FixtureDef): CalibrationStep[] {
  const map = fixtureChannelMap(fixture)
  return map.pan !== undefined ? ['home', 'rotation', 'limits', 'perspective'] : ['home']
}

/** Complete = a home direction and a perspective were chosen (moving
 *  head); a static light only needs its direction. Rotation defaults to
 *  not-reversed and Limits defaults to the profile's full range, so
 *  neither needs a visit to count as done. (The guide, p.60, says a
 *  checkmark appears below the fixture icon once this is done, but
 *  Jake's LightKey test 25 Nov 2026 found no tick in the normal
 *  Preview for either a static or a moving fixture — the tick is
 *  shown only in the setup wizard's directions step.) */
export function isCalibrationComplete(fixture: FixtureDef): boolean {
  const calibration = fixture.calibration
  if (!calibration || typeof calibration.homeDirection !== 'number') return false
  return calibrationSteps(fixture).includes('perspective') ? calibration.perspective !== undefined : true
}

/** Preview compass degrees (0 = up/north on the canvas, clockwise) to
 *  the Preview beam's rotation, which is measured clockwise from down
 *  (the beam polygon points down at 0°). */
export function compassToPreviewDirection(compassDegrees: number): number {
  return (compassDegrees + 180) % 360
}

function clampDegrees(value: number, min: number, max: number): number {
  const lo = Math.min(min, max), hi = Math.max(min, max)
  return Math.max(lo, Math.min(hi, value))
}

/**
 * Clamp + mirror pan/tilt channels for calibrated fixtures, applied to
 * the composed DMX output — LightKey's limits hold on output (cf. the
 * guide's dimmer limits, p.62, which "affect only the DMX output").
 * Limits constrain the intended angle (what the beam should do); the
 * rotation flip then mirrors it for a reversed yoke. Uncalibrated
 * fixtures and channels absent from the output pass through untouched.
 */
export function applyCalibrationOutput(output: Record<number, number>, fixtures: FixtureDef[]): Record<number, number> {
  const next = { ...output }
  for (const fixture of fixtures) {
    const calibration = fixture.calibration
    if (!calibration) continue
    const map = fixtureChannelMap(fixture)
    const { pan: panRange, tilt: tiltRange } = panTiltRange(fixture)
    const panOffset = map.pan
    if (panOffset !== undefined) {
      const channel = fixture.channelStart + panOffset
      const value = next[channel]
      if (typeof value === 'number') {
        const degrees = clampDegrees(channelToDegrees(panRange, value), calibration.panMin ?? -panRange / 2, calibration.panMax ?? panRange / 2)
        next[channel] = degreesToChannel(panRange, calibration.rotationReversed ? -degrees : degrees)
      }
    }
    const tiltOffset = map.tilt
    if (tiltOffset !== undefined) {
      const channel = fixture.channelStart + tiltOffset
      const value = next[channel]
      if (typeof value === 'number') {
        const degrees = clampDegrees(channelToDegrees(tiltRange, value), calibration.tiltMin ?? -tiltRange / 2, calibration.tiltMax ?? tiltRange / 2)
        next[channel] = degreesToChannel(tiltRange, degrees)
      }
    }
  }
  return next
}

/**
 * Live DMX patch for a calibration step — the fixture moves while you
 * calibrate (Guide pp.58–60). Home and Limits hold the home position
 * (pan centre, tilt 90°, dimmer full); Rotation sweeps the pan slowly
 * around the centre (the return leg runs in blackout, Guide p.59) — the
 * sweep angle and blackout flag come from the dialog's animation loop;
 * Perspective holds the centre of the pan and tilt ranges (Guide p.60).
 */
export function calibrationStepPatch(fixtures: FixtureDef[], step: CalibrationStep, rotationPanDegrees = 0, rotationBlackout = false): Record<number, number> {
  const patch: Record<number, number> = {}
  for (const fixture of fixtures) {
    const map = fixtureChannelMap(fixture)
    const home = defaultHomeValues(fixture)
    const write = (attribute: string, value: number) => {
      const offset = map[attribute]
      if (offset !== undefined) patch[fixture.channelStart + offset] = value
    }
    if (step === 'home' || step === 'limits') {
      write('pan', home.pan)
      write('tilt', home.tilt)
      write('intensity', 255)
    } else if (step === 'rotation') {
      const { pan } = panTiltRange(fixture)
      write('pan', degreesToChannel(pan, rotationPanDegrees))
      write('tilt', home.tilt)
      write('intensity', rotationBlackout ? 0 : 255)
    } else {
      write('pan', 128)
      write('tilt', 128)
      write('intensity', 255)
    }
  }
  return patch
}

/** Merge a step's values into a fixture's stored calibration. */
export function withCalibrationStep(fixture: FixtureDef, step: CalibrationStep, values: Partial<FixtureCalibration>): FixtureCalibration {
  const current = fixture.calibration ?? {}
  if (step === 'home') return { ...current, homeDirection: values.homeDirection ?? current.homeDirection }
  if (step === 'rotation') return { ...current, rotationReversed: values.rotationReversed ?? current.rotationReversed ?? false }
  if (step === 'limits') return { ...current, panMin: values.panMin ?? current.panMin, panMax: values.panMax ?? current.panMax, tiltMin: values.tiltMin ?? current.tiltMin, tiltMax: values.tiltMax ?? current.tiltMax }
  return { ...current, perspective: values.perspective ?? current.perspective }
}
