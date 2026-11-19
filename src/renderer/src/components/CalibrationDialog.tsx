import { useEffect, useMemo, useRef, useState } from 'react'
import type { CalibrationPerspective, FixtureCalibration, FixtureDef } from '@shared/types'
import { CALIBRATION_PERSPECTIVES, CALIBRATION_STEPS, calibrationStepPatch, calibrationSteps, compassToPreviewDirection, panTiltRange, type CalibrationStep } from '../lib/calibration'
import { setCalibrationOutput } from '../lib/output'
import { useShowStore } from '../stores/showStore'

const CX = 170, CY = 170, R = 150

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

function formatDegrees(value: number): string {
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}°`
}

function DialTicks({ radius, labels }: { radius: number; labels: number[] }) {
  return (
    <g>
      {Array.from({ length: 72 }, (_, i) => {
        const angle = i * 5
        const outer = polar(angle, radius), inner = polar(angle, radius - (angle % 30 === 0 ? 10 : 5))
        return <line key={angle} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke="var(--dim)" strokeWidth={angle % 30 === 0 ? 1.5 : 0.75} />
      })}
      {labels.map((angle) => {
        const p = polar(angle, radius - 24)
        return <text key={angle} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill="var(--dim)" fontSize="10">{angle > 0 ? `+${angle}°` : angle < 0 ? `${angle}°` : '0°'}</text>
      })}
    </g>
  )
}

function FixtureGlyph({ label }: { label: string }) {
  return (
    <g>
      <text x={CX} y={CY - 34} textAnchor="middle" fill="var(--text)" fontSize="12" fontWeight="600">{label}</text>
      <circle cx={CX} cy={CY} r="24" fill="#111" stroke="var(--text)" strokeWidth="2" />
      {[-8, 0, 8].map((dx) => [-8, 0, 8].map((dy) => <circle key={`${dx}:${dy}`} cx={CX + dx} cy={CY + dy} r="2.5" fill="var(--dim)" />))}
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
  const [rotationReturning, setRotationReturning] = useState(false)
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

  // Rotation step (Guide p.59): a slow pan sweep (±45° over 4s), then the
  // light turns back in blackout over 1s and repeats. The dial's arc
  // follows the sweep; clicking inside the circle reverses it.
  useEffect(() => {
    if (step !== 'rotation') return
    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      const t = ((now - startedAt) / 1000) % 5
      const angle = t < 4 ? -45 + 90 * (t / 4) : 45 - 90 * ((t - 4) / 1)
      const blackout = t >= 4
      setRotationAngle(angle)
      setRotationReturning(blackout)
      setCalibrationOutput(calibrationStepPatch(fixtures, 'rotation', rotationReversed ? -angle : angle, blackout))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); setCalibrationOutput({}) }
  }, [step, fixtures, rotationReversed])

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
    for (let d = 30; d <= rangeDegrees / 2; d += 30) { labels.push(d, -d) }
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
                  {step === 'home' && <DialTicks radius={R} labels={[]} />}
                  {step === 'rotation' && <DialTicks radius={R} labels={dialLabels(360)} />}
                  {step === 'limits' && <DialTicks radius={R} labels={dialLabels(range.pan)} />}
                  {step === 'home' && (
                    <g transform={`rotate(${homeDirection} ${CX} ${CY})`}>
                      <polygon points={`${CX},${CY - 135} ${CX + 26},${CY - 30} ${CX + 14},${CY - 30} ${CX + 14},${CY + 70} ${CX - 14},${CY + 70} ${CX - 14},${CY - 30} ${CX - 26},${CY - 30}`} fill="#2563eb" />
                    </g>
                  )}
                  {step === 'rotation' && (
                    <g>
                      <path d={arcPath(R - 18, -45, rotationAngle)} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
                      {(() => { const dir = rotationReturning ? -1 : 1; const tip = polar(rotationAngle + dir * 6, R - 18); const base = polar(rotationAngle - dir * 10, R - 18); return <polygon points={`${tip.x},${tip.y} ${base.x},${base.y} ${polar(rotationAngle, R - 30).x},${polar(rotationAngle, R - 30).y}`} fill="#2563eb" /> })()}
                      <text x={CX} y={CY + 90} textAnchor="middle" fill="var(--dim)" fontSize="11">{rotationReversed ? 'Reversed — click inside the circle to restore' : 'Click inside the circle to reverse the direction'}</text>
                    </g>
                  )}
                  {step === 'limits' && (
                    <g>
                      <path d={arcPath(R, panAngle(panMin), panAngle(panMax))} fill="none" stroke="#22c55e" strokeWidth="5" />
                      <path d={arcPath(R, panAngle(panMax), panAngle(panMin))} fill="none" stroke="#ef4444" strokeWidth="5" />
                      <path d={arcPath(R - 28, tiltAngle(tiltMin), tiltAngle(tiltMax))} fill="none" stroke="#22c55e" strokeWidth="5" />
                      <path d={arcPath(R - 28, tiltAngle(tiltMax), tiltAngle(tiltMin))} fill="none" stroke="#ef4444" strokeWidth="5" />
                      {([
                        { kind: 'panMin', angle: panAngle(panMin), radius: R, fill: '#ef4444' },
                        { kind: 'panMax', angle: panAngle(panMax), radius: R, fill: '#22c55e' },
                        { kind: 'tiltMin', angle: tiltAngle(tiltMin), radius: R - 28, fill: '#ef4444' },
                        { kind: 'tiltMax', angle: tiltAngle(tiltMax), radius: R - 28, fill: '#22c55e' }
                      ] as const).map((handle) => {
                        const p = polar(handle.angle, handle.radius)
                        const q = polar(handle.angle + 12, handle.radius)
                        const r = polar(handle.angle - 12, handle.radius)
                        return <polygon key={handle.kind} points={`${p.x},${p.y} ${q.x},${q.y} ${r.x},${r.y}`} fill={handle.fill} stroke="var(--bg)" strokeWidth="1" style={{ cursor: 'grab' }} onPointerDown={startDrag(handle.kind)} />
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
