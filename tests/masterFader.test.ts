// Master fader redesign + quadrant BPM button + borderless Live view
// (Jake, 18 Nov 2026, screenshots 9.56.45 / 9.58.58 / 10.00.16):
// LightKey's Master is a wide solid bar that fills from the bottom, the
// BPM box is a separate element underneath it split into four quadrants
// (one lights up per BEAT, clockwise — Jake's correction, 18 Nov 2026:
// the earlier quarter-beat step was 4x too fast), and the Live page panel
// borders only render in Live Edit mode. Pure-function tests for the
// quadrant timing plus source/wiring assertions (no DOM renderer),
// in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BEAT_QUADRANTS, beatQuadrantAt, nextBeatQuadrant, beatMs
} from '../src/renderer/src/lib/beatQuadrant'

const root = resolve(__dirname, '..')
const workspace = readFileSync(resolve(root, 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')
const masterFader = readFileSync(resolve(root, 'src/renderer/src/components/MasterFader.tsx'), 'utf8')
const app = readFileSync(resolve(root, 'src/renderer/src/App.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')

describe('beat quadrant timing — one quadrant per beat, clockwise', () => {
  it('is 60000 / bpm ms per quadrant, and null with no usable tempo', () => {
    expect(beatMs(120)).toBe(500)
    expect(beatMs(60)).toBe(1000)
    expect(beatMs(90)).toBeCloseTo(60000 / 90)
    expect(beatMs(0)).toBeNull()
    expect(beatMs(-10)).toBeNull()
    expect(beatMs(Number.NaN)).toBeNull()
  })

  it('makes 15 full rotations per minute at 60 bpm — one quadrant per second', () => {
    // Jake's check, 18 Nov 2026: at 60 bpm the highlight steps once per
    // second, so 60 quadrant steps a minute is 60 / 4 = 15 rotations.
    const stepsPerMinuteAt60 = 60000 / (beatMs(60) as number)
    expect(stepsPerMinuteAt60).toBe(60)
    expect(stepsPerMinuteAt60 / BEAT_QUADRANTS.length).toBe(15)
    // At 120 bpm it steps twice as fast: 30 rotations a minute.
    const stepsPerMinuteAt120 = 60000 / (beatMs(120) as number)
    expect(stepsPerMinuteAt120).toBe(120)
    expect(stepsPerMinuteAt120 / BEAT_QUADRANTS.length).toBe(30)
  })

  it('advances top-left → top-right → bottom-right → bottom-left, then repeats', () => {
    expect(BEAT_QUADRANTS).toEqual(['top-left', 'top-right', 'bottom-right', 'bottom-left'])
    expect(nextBeatQuadrant('top-left')).toBe('top-right')
    expect(nextBeatQuadrant('top-right')).toBe('bottom-right')
    expect(nextBeatQuadrant('bottom-right')).toBe('bottom-left')
    expect(nextBeatQuadrant('bottom-left')).toBe('top-left')
  })

  it('steps every beat from the clock start', () => {
    // 120 bpm: a beat is 500ms.
    expect(beatQuadrantAt(0, 120)).toBe('top-left')
    expect(beatQuadrantAt(499, 120)).toBe('top-left')
    expect(beatQuadrantAt(500, 120)).toBe('top-right')
    expect(beatQuadrantAt(1000, 120)).toBe('bottom-right')
    expect(beatQuadrantAt(1500, 120)).toBe('bottom-left')
    expect(beatQuadrantAt(2000, 120)).toBe('top-left')
    expect(beatQuadrantAt(2500, 120)).toBe('top-right')
    // 60 bpm: a beat is 1000ms — one quadrant per second.
    expect(beatQuadrantAt(0, 60)).toBe('top-left')
    expect(beatQuadrantAt(1000, 60)).toBe('top-right')
    expect(beatQuadrantAt(2000, 60)).toBe('bottom-right')
    expect(beatQuadrantAt(3000, 60)).toBe('bottom-left')
    expect(beatQuadrantAt(4000, 60)).toBe('top-left')
  })

  it('lights nothing with no usable tempo', () => {
    expect(beatQuadrantAt(0, 0)).toBeNull()
    expect(beatQuadrantAt(1000, 0)).toBeNull()
    expect(beatQuadrantAt(0, -5)).toBeNull()
  })
})

describe('quadrant BPM button — separate from the fader, one lit quadrant at a time', () => {
  it('renders the four quadrants behind the bpm text and steps them on a one-beat interval', () => {
    expect(masterFader).toContain('BEAT_QUADRANTS.map((quadrant)')
    expect(masterFader).toContain("data-quadrant={quadrant}")
    expect(masterFader).toContain('bpm-quadrant-lit')
    expect(masterFader).toContain('beatMs(bpm)')
    expect(masterFader).not.toContain('quarterBeatMs')
    expect(masterFader).toContain('window.setInterval(')
    expect(masterFader).toContain('nextBeatQuadrant(current)')
    // The interval is cleared when the tempo changes or the button unmounts.
    expect(masterFader).toContain('return () => window.clearInterval(timer)')
    // No quadrant is lit with no usable tempo.
    expect(masterFader).toContain('if (beat === null) { setLit(null); return }')
    // The text stays readable above the quadrants.
    expect(masterFader).toContain('live-master-bpm-text')
    expect(css).toContain('.live-master-bpm-quadrants {')
    expect(css).toContain('.bpm-quadrant-lit { background: rgba(217, 212, 245, 0.55);')
    expect(css).toContain('.live-master-bpm-text { position: relative; z-index: 1; }')
    // Quadrants sit in their corners, not in render order (bottom-right
    // is row 2, column 2 — grid auto-placement would put it at row 2,
    // column 1).
    expect(css).toContain(".bpm-quadrant[data-quadrant='top-left'] { grid-area: 1 / 1; }")
    expect(css).toContain(".bpm-quadrant[data-quadrant='top-right'] { grid-area: 1 / 2; }")
    expect(css).toContain(".bpm-quadrant[data-quadrant='bottom-right'] { grid-area: 2 / 2; }")
    expect(css).toContain(".bpm-quadrant[data-quadrant='bottom-left'] { grid-area: 2 / 1; }")
  })

  it('still taps the tempo and shows the bpm value', () => {
    expect(masterFader).toContain('aria-label="Tap tempo"')
    expect(masterFader).toContain('onClick={onTap}')
    expect(masterFader).toContain("bpm > 0 ? Math.round(bpm) : '—'")
    expect(masterFader).toContain('<small>bpm</small>')
    // The tap handler lives in App.tsx now (the column is a child of the
    // bottom panel shell, not of the workspace): it shares the header Tap
    // button's tap history.
    expect(app).toContain('calculateTapTempo(headerTaps.current')
    expect(app).toContain('setBpm(result.bpm)')
  })
})

describe('Master track — drag and keyboard still set the store master', () => {
  it('is a slider with pointer drag and full keyboard support', () => {
    expect(masterFader).toContain('role="slider"')
    expect(masterFader).toContain('aria-orientation="vertical"')
    expect(masterFader).toContain('aria-valuemin={0}')
    expect(masterFader).toContain('aria-valuemax={255}')
    expect(masterFader).toContain('aria-valuenow={value}')
    expect(masterFader).toContain('setPointerCapture')
    expect(masterFader).toContain("event.key === 'ArrowUp'")
    expect(masterFader).toContain("event.key === 'ArrowDown'")
    expect(masterFader).toContain("event.key === 'Home'")
    expect(masterFader).toContain("event.key === 'End'")
    expect(masterFader).toContain("event.key === 'PageUp'")
    expect(masterFader).toContain("event.key === 'PageDown'")
    // Top of the track is Full (255), bottom is 0.
    expect(masterFader).toContain('(1 - (clientY - rect.top) / rect.height) * 255')
  })
})

describe('Live panel borders — gone in Live mode, back in Live Edit mode', () => {
  it('gates the page section, canvas container and blank-page borders on editing', () => {
    // One shared border choice, used by all three bordered boxes.
    expect(workspace).toContain("const panelBorder = editing ? 'border border-line' : 'border border-transparent'")
    expect(workspace).toContain('rounded ${panelBorder} bg-bg/30 p-3')
    expect(workspace).toContain('min-w-0 flex-1 overflow-auto rounded ${panelBorder}')
    expect(workspace).toContain('items-center justify-center rounded ${panelBorder} bg-panel')
    // No hard-coded panel border is left on the section or canvas.
    expect(workspace).not.toContain('rounded border border-line bg-bg/30 p-3')
    expect(workspace).not.toContain('min-w-0 flex-1 overflow-auto rounded border border-line')
  })

  it('keeps the borders that are not the page panel — cue buttons, frames, Master rail, inspector', () => {
    // Frames on the canvas keep their border; the Master rail keeps its
    // border box; cue buttons are unchanged.
    expect(workspace).toContain("item.type === 'frame' ? 'border border-line rounded'")
    expect(css).toContain('.live-master-rail {')
    expect(css).toContain('border: 1px solid var(--line)')
  })
})
