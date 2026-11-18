// Master fader redesign + quadrant BPM button + borderless Live view
// (Jake, 18 Nov 2026, screenshots 9.56.45 / 9.58.58 / 10.00.16):
// LightKey's Master is a wide solid bar that fills from the bottom, the
// BPM box is a separate element underneath it split into four quadrants
// (one lights up per quarter beat, clockwise), and the Live page panel
// borders only render in Live Edit mode. Pure-function tests for the
// quadrant timing plus source/wiring assertions (no DOM renderer),
// in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BEAT_QUADRANTS, beatQuadrantAt, nextBeatQuadrant, quarterBeatMs
} from '../src/renderer/src/lib/beatQuadrant'

const root = resolve(__dirname, '..')
const workspace = readFileSync(resolve(root, 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')
const masterFader = readFileSync(resolve(root, 'src/renderer/src/components/MasterFader.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')

describe('beat quadrant timing — one quadrant per quarter beat, clockwise', () => {
  it('is 60000 / bpm / 4 ms per quadrant, and null with no usable tempo', () => {
    expect(quarterBeatMs(120)).toBe(125)
    expect(quarterBeatMs(60)).toBe(250)
    expect(quarterBeatMs(90)).toBeCloseTo(60000 / 90 / 4)
    expect(quarterBeatMs(0)).toBeNull()
    expect(quarterBeatMs(-10)).toBeNull()
    expect(quarterBeatMs(Number.NaN)).toBeNull()
  })

  it('advances top-left → top-right → bottom-right → bottom-left, then repeats', () => {
    expect(BEAT_QUADRANTS).toEqual(['top-left', 'top-right', 'bottom-right', 'bottom-left'])
    expect(nextBeatQuadrant('top-left')).toBe('top-right')
    expect(nextBeatQuadrant('top-right')).toBe('bottom-right')
    expect(nextBeatQuadrant('bottom-right')).toBe('bottom-left')
    expect(nextBeatQuadrant('bottom-left')).toBe('top-left')
  })

  it('steps every quarter beat from the clock start', () => {
    // 120 bpm: a quarter beat is 125ms.
    expect(beatQuadrantAt(0, 120)).toBe('top-left')
    expect(beatQuadrantAt(124, 120)).toBe('top-left')
    expect(beatQuadrantAt(125, 120)).toBe('top-right')
    expect(beatQuadrantAt(250, 120)).toBe('bottom-right')
    expect(beatQuadrantAt(375, 120)).toBe('bottom-left')
    expect(beatQuadrantAt(500, 120)).toBe('top-left')
    expect(beatQuadrantAt(625, 120)).toBe('top-right')
    // 90 bpm: a quarter beat is ~166.7ms.
    expect(beatQuadrantAt(0, 90)).toBe('top-left')
    expect(beatQuadrantAt(167, 90)).toBe('top-right')
    expect(beatQuadrantAt(334, 90)).toBe('bottom-right')
    expect(beatQuadrantAt(500, 90)).toBe('bottom-left')
    expect(beatQuadrantAt(667, 90)).toBe('top-left')
  })

  it('lights nothing with no usable tempo', () => {
    expect(beatQuadrantAt(0, 0)).toBeNull()
    expect(beatQuadrantAt(1000, 0)).toBeNull()
    expect(beatQuadrantAt(0, -5)).toBeNull()
  })
})

describe('quadrant BPM button — separate from the fader, one lit quadrant at a time', () => {
  it('renders the four quadrants behind the bpm text and steps them on a quarter-beat interval', () => {
    expect(masterFader).toContain('BEAT_QUADRANTS.map((quadrant)')
    expect(masterFader).toContain("data-quadrant={quadrant}")
    expect(masterFader).toContain('bpm-quadrant-lit')
    expect(masterFader).toContain('quarterBeatMs(bpm)')
    expect(masterFader).toContain('window.setInterval(')
    expect(masterFader).toContain('nextBeatQuadrant(current)')
    // The interval is cleared when the tempo changes or the button unmounts.
    expect(masterFader).toContain('return () => window.clearInterval(timer)')
    // No quadrant is lit with no usable tempo.
    expect(masterFader).toContain('if (quarter === null) { setLit(null); return }')
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
    expect(workspace).toContain('calculateTapTempo(masterTaps.current')
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
