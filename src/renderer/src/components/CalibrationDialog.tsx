import { useEffect, useMemo, useRef, useState } from 'react'
import type { CalibrationPerspective, FixtureCalibration, FixtureDef } from '@shared/types'
import { CALIBRATION_PERSPECTIVES, CALIBRATION_STEPS, calibrationStepPatch, calibrationSteps, compassToPreviewDirection, panTiltRange, wrapRotationDegrees, type CalibrationStep } from '../lib/calibration'
import { setCalibrationOutput } from '../lib/output'
import { useShowStore } from '../stores/showStore'

const CX = 170, CY = 170, R = 150
/** Rotation dial tick-ring radius — smaller than R so the degree labels
 *  fit at the rim, outside the ticks, like LightKey's (R would push
 *  them off the SVG's edge). The sweep arc sits inside at R − 18. */
const ROTATION_RADIUS = 132

/** Point on the dial for a compass angle (0° = up, clockwise). */
function polar(angleDegrees: number, radius: number): { x: number; y: number } {
  const a = (angleDegrees * Math.PI) / 180
  return { x: CX + radius * Math.sin(a), y: CY - radius * Math.cos(a) }
}

/** Compass angle (0–360°) of a pointer position over the dial SVG. */
function angleFromEvent(event: React.PointerEvent, svg: SVGSVGElement | null): number {
  if (!svg) return 0
  const rect = svg.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 340
  const y = ((event.clientY - rect.top) / rect.height) * 340
  return (Math.atan2(x - CX, -(y - CY)) * 180 / Math.PI + 360) % 360
}

/** SVG arc path from one compass angle to another, clockwise. */
function arcPath(radius: number, fromDegrees: number, toDegrees: number): string {
  const start = polar(fromDegrees, radius), end = polar(toDegrees, radius)
  const sweep = ((toDegrees - fromDegrees) % 360 + 360) % 360
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`
}

/**
 * SVG path for a Limits arc, given the span it covers in dial degrees.
 * A plain arc degenerates to nothing when its ends coincide — which is
 * exactly what a full-range fixture does (min and max are the same dial
 * point), so the default state showed no arcs at all. A span covering
 * the whole dial is a full circle instead, and a zero span is nothing
 * (the complement arc is then the full circle).
 */
function limitArcPath(radius: number, fromDegrees: number, toDegrees: number, spanDegrees: number): string {
  if (spanDegrees >= 360) return `M ${CX - radius} ${CY} A ${radius} ${radius} 0 1 0 ${CX + radius} ${CY} A ${radius} ${radius} 0 1 0 ${CX - radius} ${CY}`
  if (spanDegrees <= 0) return ''
  return arcPath(radius, fromDegrees, toDegrees)
}

/**
 * Point on the Rotation dial for a pan angle. LightKey's Rotation dial
 * (Jake's MH3 screenshot, 25 Nov 2026) has 0° at the bottom — the beam
 * pointing towards the viewer at home — with +90° at the right and
 * +180° at the top, so a pan angle maps to polar(180° − angle). The
 * Home dial is a compass (0° at the top) and keeps plain polar().
 */
function polarRotation(angleDegrees: number, radius: number): { x: number; y: number } {
  return polar(180 - angleDegrees, radius)
}

/**
 * SVG arc path on the Rotation dial, from one pan angle to another.
 * On this dial increasing pan runs counterclockwise on screen, so the
 * sweep flag is the opposite of the compass arc: `forward` (towards
 * increasing pan) draws counterclockwise.
 */
function rotationArcPath(radius: number, fromDegrees: number, toDegrees: number, forward: boolean): string {
  const start = polarRotation(fromDegrees, radius), end = polarRotation(toDegrees, radius)
  const diff = Math.abs(toDegrees - fromDegrees) % 360
  const span = Math.min(diff, 360 - diff)
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${span > 180 ? 1 : 0} ${forward ? 0 : 1} ${end.x} ${end.y}`
}

/** Faint radial spokes (LightKey's dials show one every 30°). */
function DialSpokes({ radius, fromRadius = 30 }: { radius: number; fromRadius?: number }) {
  return (
    <g opacity="0.35">
      {Array.from({ length: 12 }, (_, i) => {
        const angle = i * 30
        const outer = polar(angle, radius), inner = polar(angle, fromRadius)
        return <line key={angle} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--dim)" strokeWidth="0.5" />
      })}
    </g>
  )
}

function formatDegrees(value: number): string {
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}°`
}

function DialTicks({ radius, labels, point = polar, labelRadius, labelRotation }: { radius: number; labels: number[]; point?: (angle: number, radius: number) => { x: number; y: number }; labelRadius?: number; labelRotation?: (angle: number) => number }) {
  return (
    <g>
      {Array.from({ length: 72 }, (_, i) => {
        const angle = i * 5
        const outer = point(angle, radius), inner = point(angle, radius - (angle % 30 === 0 ? 10 : 5))
        return <line key={`tick-${angle}`} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke="var(--dim)" strokeWidth={angle % 30 === 0 ? 1.5 : 0.75} />
      })}
      {labels.map((angle) => {
        // Labels sit at the rim (labelRadius, outside the tick ring),
        // rotated to read along the rim like LightKey's — never inside
        // the dial where they collide with the arcs (the Rotation and
        // Limits labels used to sit on the arcs).
        const p = point(angle, labelRadius ?? radius - 24)
        const rotation = labelRotation ? labelRotation(angle) : 0
        return <text key={`label-${angle}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill="var(--dim)" fontSize="10" transform={rotation ? `rotate(${rotation} ${p.x} ${p.y})` : undefined}>{angle > 0 ? `+${angle}°` : angle < 0 ? `${angle}°` : '0°'}</text>
      })}
    </g>
  )
}

function FixtureGlyph({ label }: { label: string }) {
  // LightKey's dial centre is a plain black circle with a white ring
  // (Jake's MH3 screenshots, 25 Nov 2026) — no dotted lens.
  return (
    <g>
      <text x={CX} y={CY - 34} textAnchor="middle" fill="var(--text)" fontSize="12" fontWeight="600">{label}</text>
      <circle cx={CX} cy={CY} r="24" fill="#111" stroke="var(--text)" strokeWidth="2" />
    </g>
  )
}

function StepIcon({ step }: { step: CalibrationStep }) {
  if (step === 'home') return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="7" y="2" width="6" height="9" rx="3" /><path d="M10 11v5M7 14l3 3 3-3" /></svg>
  if (step === 'rotation') return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 10a6 6 0 1 1-2-4.5" /><path d="M14 1v4h-4" /></svg>
  if (step === 'limits') return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 14a8 8 0 0 1 14 0" /><path d="M3 14l-1.5 2M17 14l1.5 2" /></svg>
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="7" y="4" width="6" height="9" rx="3" /><path d="M4 10h-2M18 10h-2" /></svg>
}

function PerspectiveGlyph({ perspective }: { perspective: CalibrationPerspective }) {
  if (perspective === 'parallel') return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="22" cy="22" r="14" /><circle cx="22" cy="22" r="7" /><circle cx="22" cy="22" r="2" fill="currentColor" /></svg>
  )
  const rotate = perspective === 'up' ? 0 : perspective === 'down' ? 180 : perspective === 'left' ? -90 : 90
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: `rotate(${rotate}deg)` }}>
      <rect x="15" y="6" width="14" height="20" rx="7" />
      <path d="M15 30h14M19 30v6M25 30v6" />
    </svg>
  )
}

interface CalibrationDialogProps {
  fixtureIds: string[]
  onClose: () => void
  /** Called after the draft is saved (the wizard advances on this). */
  onDone?: () => void
}

// The Beam Direction dialog (LightKey Guide pp.58–60): a floating panel
// with the four steps down the left, a big dial in the middle, the
// guide's instruction on the right, a "?" help button and a blue Done
// button. While it is open the fixtures move live (home position, the
// rotation sweep, or the centre of the pan/tilt ranges) through the
// calibration output layer; closing clears it so the rig returns to
// exactly what it was doing.
export function CalibrationDialog({ fixtureIds, onClose, onDone }: CalibrationDialogProps) {
  const show = useShowStore((s) => s.show)
  const fixtures = useMemo(() => fixtureIds.map((id) => show?.fixtures.find((f) => f.id === id)).filter((f): f is FixtureDef => Boolean(f)), [fixtureIds, show])
  const first = fixtures[0]
  const steps = useMemo(() => {
    const all = fixtures.flatMap((f) => calibrationSteps(f))
    return (['home', 'rotation', 'limits', 'perspective'] as CalibrationStep[]).filter((s) => all.includes(s))
  }, [fixtures])
  const [step, setStep] = useState<CalibrationStep>('home')
  const [homeDirection, setHomeDirection] = useState(() => first?.calibration?.homeDirection ?? 0)
  const [rotationReversed, setRotationReversed] = useState(() => first?.calibration?.rotationReversed ?? false)
  const [perspective, setPerspective] = useState<CalibrationPerspective | undefined>(() => first?.calibration?.perspective)
  const range = useMemo(() => (first ? panTiltRange(first) : { pan: 540, tilt: 270 }), [first])
  const [panMin, setPanMin] = useState(() => first?.calibration?.panMin ?? -range.pan / 2)
  const [panMax, setPanMax] = useState(() => first?.calibration?.panMax ?? range.pan / 2)
  const [tiltMin, setTiltMin] = useState(() => first?.calibration?.tiltMin ?? -range.tilt / 2)
  const [tiltMax, setTiltMax] = useState(() => first?.calibration?.tiltMax ?? range.tilt / 2)
  const [readout, setReadout] = useState<string | null>(null)
  const [rotationAngle, setRotationAngle] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<string | null>(null)

  const close = () => { setCalibrationOutput({}); onClose() }

  const done = () => {
    const state = useShowStore.getState()
    state.beginHistoryGroup()
    for (const fixture of fixtures) {
      const calibration: FixtureCalibration = { ...fixture.calibration }
      if (calibrationSteps(fixture).includes('home')) calibration.homeDirection = homeDirection
      if (calibrationSteps(fixture).includes('rotation')) calibration.rotationReversed = rotationReversed
      if (calibrationSteps(fixture).includes('limits')) {
        calibration.panMin = Math.min(panMin, panMax)
        calibration.panMax = Math.max(panMin, panMax)
        calibration.tiltMin = Math.min(tiltMin, tiltMax)
        calibration.tiltMax = Math.max(tiltMin, tiltMax)
      }
      if (calibrationSteps(fixture).includes('perspective') && perspective) calibration.perspective = perspective
      const patch: Partial<FixtureDef> = { calibration }
      // The Preview beam points where the fixture points at home.
      if (calibrationSteps(fixture).includes('home')) patch.previewBeam = { ...fixture.previewBeam, direction: compassToPreviewDirection(homeDirection) }
      state.updateFixture(fixture.id, patch)
    }
    state.endHistoryGroup()
    setCalibrationOutput({})
    onDone?.()
    onClose()
  }

  // Live DMX while calibrating: the fixtures move to the step's position.
  // The rotation sweep is driven by a rAF loop below.
  useEffect(() => {
    if (step !== 'rotation') setCalibrationOutput(calibrationStepPatch(fixtures, step))
    return () => { setCalibrationOutput({}) }
  }, [step, fixtures])

  // Rotation step (Guide p.59): a slow pan sweep that scrolls around
  // the dial forever — in LightKey "the arrow just infinitely
  // scrolls" (Jake, 26 Nov 2026); ours swept once and then rewound
  // to the start in blackout. The angle rises at 45°/s (8s per full
  // turn) and wraps at ±180°, which is the same point on the dial, so
  // the arrow never jumps; the pan channel wraps with it
  // (wrapRotationDegrees) so the beam keeps turning the same way
  // instead of hitting a range end. Clicking inside the circle flips
  // rotationReversed and the arrow scrolls the other way. The drawn
  // arrow follows the same (possibly reversed) angle the DMX gets.
  useEffect(() => {
    if (step !== 'rotation') return
    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000
      const angle = -180 + ((elapsed * 45) % 360)
      setRotationAngle(angle)
      setCalibrationOutput(calibrationStepPatch(fixtures, 'rotation', wrapRotationDegrees(range.pan, rotationReversed ? -angle : angle), false))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); setCalibrationOutput({}) }
  }, [step, fixtures, rotationReversed, range.pan])

  // Esc closes without saving (the app's "Stop / close panel").
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!first) return null
  const centreLabel = fixtures.length > 1 ? `${fixtures.length} fixtures` : first.shortName ?? first.name

  const instruction = CALIBRATION_STEPS.find((s) => s.id === step)?.instruction ?? ''
  const dialLabels = (rangeDegrees: number) => {
    const labels: number[] = [0]
    for (let d = 30; d < rangeDegrees / 2; d += 30) { labels.push(d, -d) }
    // The far end is one point on the dial, not two: +180° and −180°
    // are the same position, so only one label (and one key) for it.
    labels.push(rangeDegrees / 2)
    return labels
  }

  const startDrag = (kind: string) => (event: React.PointerEvent) => {
    event.preventDefault()
    dragRef.current = kind
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event: React.PointerEvent) => {
    const kind = dragRef.current
    if (!kind) return
    const angle = angleFromEvent(event, svgRef.current)
    if (kind === 'home') {
      setHomeDirection(Math.round(angle))
      return
    }
    // The dial's full circle is the axis's full range: a dial angle
    // (signed, −180…180°) maps to degrees of that range.
    const signed = angle > 180 ? angle - 360 : angle
    const toDegrees = (axisRange: number) => Math.round((signed * axisRange / 360) * 10) / 10
    if (kind === 'panMin') { const v = toDegrees(range.pan); setPanMin(Math.min(v, panMax)); setReadout(`MIN. PAN ${formatDegrees(v)}`) }
    if (kind === 'panMax') { const v = toDegrees(range.pan); setPanMax(Math.max(v, panMin)); setReadout(`MAX. PAN ${formatDegrees(v)}`) }
    if (kind === 'tiltMin') { const v = toDegrees(range.tilt); setTiltMin(Math.min(v, tiltMax)); setReadout(`MIN. TILT ${formatDegrees(v)}`) }
    if (kind === 'tiltMax') { const v = toDegrees(range.tilt); setTiltMax(Math.max(v, tiltMin)); setReadout(`MAX. TILT ${formatDegrees(v)}`) }
  }
  const endDrag = () => { dragRef.current = null; setReadout(null) }

  const panAngle = (degrees: number) => (degrees * 360 / range.pan + 360) % 360
  const tiltAngle = (degrees: number) => (degrees * 360 / range.tilt + 360) % 360

  return (
    <div role="dialog" aria-label="Beam Direction" className="absolute left-1/2 top-1/2 z-30 w-[42rem] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-panel p-0 shadow-2xl">
      <div className="flex">
        <div className="w-36 shrink-0 border-r border-line py-2">
          {steps.map((s) => (
            <button key={s} type="button" onClick={() => setStep(s)} aria-pressed={step === s} className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs ${step === s ? 'bg-blue-600 text-white' : 'text-text hover:bg-panel2'}`}>
              <StepIcon step={s} />
              {CALIBRATION_STEPS.find((item) => item.id === s)?.label}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              {step === 'perspective' ? (
                <div className="grid h-[340px] w-[340px] grid-cols-3 grid-rows-3 place-items-center rounded-full bg-panel2">
                  {CALIBRATION_PERSPECTIVES.map((option) => (
                    <button key={option.id} type="button" aria-label={`Perspective ${option.label}`} aria-pressed={perspective === option.id} onClick={() => setPerspective(option.id)} className={`flex h-24 w-24 items-center justify-center rounded-lg ${perspective === option.id ? 'bg-blue-600 text-white' : 'bg-panel text-text hover:bg-panel2'}`} style={{ gridColumn: option.position === 'left' ? 1 : option.position === 'right' ? 3 : 2, gridRow: option.position === 'top' ? 1 : option.position === 'bottom' ? 3 : 2 }}>
                      <PerspectiveGlyph perspective={option.id} />
                    </button>
                  ))}
                </div>
              ) : (
                <svg ref={svgRef} width="340" height="340" viewBox="0 0 340 340" role="img" aria-label={`${CALIBRATION_STEPS.find((s) => s.id === step)?.label} dial`} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                  onPointerDown={step === 'home' ? (event) => { startDrag('home')(event); setHomeDirection(Math.round(angleFromEvent(event, svgRef.current))) } : step === 'rotation' ? () => { setRotationReversed((v) => !v) } : undefined}>
                  <circle cx={CX} cy={CY} r={R + 6} fill="var(--panel2)" stroke="var(--line)" />
                  {step === 'home' && <><DialSpokes radius={R} /><DialTicks radius={R} labels={[]} /></>}
                  {step === 'rotation' && <><DialSpokes radius={ROTATION_RADIUS} /><DialTicks radius={ROTATION_RADIUS} labels={dialLabels(360)} point={polarRotation} labelRadius={ROTATION_RADIUS + 14} labelRotation={(angle) => -angle} /></>}
                  {step === 'limits' && <><DialSpokes radius={R} /><circle cx={CX} cy={CY} r={R / 3} fill="none" stroke="var(--dim)" strokeWidth="0.5" opacity="0.25" /><circle cx={CX} cy={CY} r={(2 * R) / 3} fill="none" stroke="var(--dim)" strokeWidth="0.5" opacity="0.25" /><DialTicks radius={R} labels={[]} /></>}
                  {step === 'home' && (
                    <g transform={`rotate(${homeDirection} ${CX} ${CY})`}>
                      {/* LightKey's Home arrow is a long dart, not a
                          diamond: a sharp point at the front and a
                          notched tail at the back — two tail peaks
                          with a V notch between them, tapering
                          straight from the tail to the point (Jake's
                          LightKey Home screenshot, 26 Nov 2026,
                          measured: tail ≈ 0.54× the length, notch
                          ≈ 0.18× deep). The c08f5a1 dial rework had
                          made it a symmetric diamond, pointed at both
                          ends and widest in the middle. */}
                      <polygon points={`${CX},${CY - 125} ${CX + 62},${CY + 105} ${CX},${CY + 64} ${CX - 62},${CY + 105}`} fill="#2563eb" />
                    </g>
                  )}
                  {step === 'rotation' && (
                    <g>
                      {(() => {
                        // The arrow the DMX follows: the same reversed
                        // angle the fixture pans to, so a click visibly
                        // reverses it on screen. The arrow is a thick
                        // curved band (LightKey's) with a large head,
                        // trailing a fixed ~65° behind the head — not a
                        // thin line growing from −45°.
                        const shown = rotationReversed ? -rotationAngle : rotationAngle
                        // Direction of travel of the shown angle: the
                        // sweep always increases it; reversed flips it
                        // so the arrow scrolls the other way.
                        const travel = rotationReversed ? -1 : 1
                        const arcRadius = ROTATION_RADIUS - 18
                        const tail = shown - 65 * travel
                        const headPoint = polarRotation(shown, arcRadius)
                        const headRad = (shown * Math.PI) / 180
                        // Tangent = direction of increasing pan on this
                        // dial, at the head; radial = outward.
                        const tx = Math.cos(headRad) * travel, ty = -Math.sin(headRad) * travel
                        const nx = Math.sin(headRad), ny = Math.cos(headRad)
                        const tip = { x: headPoint.x + tx * 14, y: headPoint.y + ty * 14 }
                        const base = { x: headPoint.x - tx * 6, y: headPoint.y - ty * 6 }
                        const b1 = { x: base.x + nx * 10, y: base.y + ny * 10 }
                        const b2 = { x: base.x - nx * 10, y: base.y - ny * 10 }
                        return (
                          <>
                            <path d={rotationArcPath(arcRadius, tail, shown, travel > 0)} fill="none" stroke="#2563eb" strokeWidth="7" strokeLinecap="round" />
                            <polygon points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`} fill="#2563eb" />
                          </>
                        )
                      })()}
                    </g>
                  )}
                  {step === 'limits' && (
                    <g>
                      {/* Rim-hugging arcs (LightKey's Limits dial): the
                          pan pair at the outermost rim, the tilt pair
                          just inside it — not two rings with the degree
                          labels squeezed between them. */}
                      <path d={limitArcPath(R, panAngle(panMin), panAngle(panMax), (panMax - panMin) * 360 / range.pan)} fill="none" stroke="#22c55e" strokeWidth="5" />
                      <path d={limitArcPath(R, panAngle(panMax), panAngle(panMin), 360 - (panMax - panMin) * 360 / range.pan)} fill="none" stroke="#ef4444" strokeWidth="5" />
                      <path d={limitArcPath(R - 16, tiltAngle(tiltMin), tiltAngle(tiltMax), (tiltMax - tiltMin) * 360 / range.tilt)} fill="none" stroke="#22c55e" strokeWidth="5" />
                      <path d={limitArcPath(R - 16, tiltAngle(tiltMax), tiltAngle(tiltMin), 360 - (tiltMax - tiltMin) * 360 / range.tilt)} fill="none" stroke="#ef4444" strokeWidth="5" />
                      {/* Needles from the centre glyph to the tilt
                          handles (LightKey's Limits dial runs a straight
                          coloured line from the fixture to each tilt
                          handle). */}
                      {([
                        { kind: 'tiltMin', angle: tiltAngle(tiltMin), radius: R - 16, fill: '#ef4444' },
                        { kind: 'tiltMax', angle: tiltAngle(tiltMax), radius: R - 16, fill: '#22c55e' }
                      ]).map((needle) => {
                        const from = polar(needle.angle, 28), to = polar(needle.angle, needle.radius - 16)
                        return <line key={needle.kind} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={needle.fill} strokeWidth="3" />
                      })}
                      {([
                        { kind: 'panMin', angle: panAngle(panMin), radius: R, fill: '#22c55e' },
                        { kind: 'panMax', angle: panAngle(panMax), radius: R, fill: '#ef4444' },
                        { kind: 'tiltMin', angle: tiltAngle(tiltMin), radius: R - 16, fill: '#ef4444' },
                        { kind: 'tiltMax', angle: tiltAngle(tiltMax), radius: R - 16, fill: '#22c55e' }
                      ] as const).map((handle) => {
                        // A big bold triangle, tip at the ring and base
                        // 16 units in, with a white outline (LightKey's
                        // handles). The old handles were three points on
                        // the ring itself — a ~3px sliver along the arc.
                        const tip = polar(handle.angle, handle.radius)
                        const base = polar(handle.angle, handle.radius - 16)
                        const rad = (handle.angle * Math.PI) / 180
                        const tx = Math.cos(rad) * 12, ty = Math.sin(rad) * 12
                        return <polygon key={handle.kind} points={`${tip.x},${tip.y} ${base.x + tx},${base.y + ty} ${base.x - tx},${base.y - ty}`} fill={handle.fill} stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" style={{ cursor: 'grab' }} onPointerDown={startDrag(handle.kind)} />
                      })}
                    </g>
                  )}
                  <FixtureGlyph label={centreLabel} />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1 pt-2 text-xs leading-relaxed text-text">
              {readout && <p className="text-2xl font-semibold">{readout}</p>}
              {instruction.split('\n\n').map((para, i) => <p key={i} className={i > 0 || readout ? 'mt-3' : ''}>{para}</p>)}
              {step === 'rotation' && rotationReversed && <p className="mt-3 text-dim">Reversed — the arrow now travels the other way. Click inside the circle to restore it.</p>}
              {step === 'limits' && <p className="mt-3 text-dim">Pan {formatDegrees(panMin)} – {formatDegrees(panMax)} · Tilt {formatDegrees(tiltMin)} – {formatDegrees(tiltMax)}</p>}
              {step === 'home' && <p className="mt-3 text-dim">Home direction {Math.round(homeDirection)}°</p>}
              {showHelp && <p className="mt-3 text-dim">LightKey User Guide, ch.7 — Set beam directions (pp.58–60). Pan angles are measured from the center of the physical pan range; the home angle is always 0°.</p>}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" aria-label="Help" title="About this step" onClick={() => setShowHelp((v) => !v)} className="flex h-6 w-6 items-center justify-center rounded-full border border-line text-xs text-dim">?</button>
            <button type="button" onClick={done} className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white">Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}
