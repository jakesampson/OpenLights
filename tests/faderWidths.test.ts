// Master fader rail + fixture fader widths (Jake's 18 Nov screenshots
// 8.54.48 / 8.57.25 / 8.58.26): the Master fader is a fixed narrow rail at
// the far left of the Live area with the BPM box underneath it, and the
// fixture faders are LightKey-narrow (~60–70px including the track).
// Source/CSS assertions (no DOM renderer), in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const workspace = readFileSync(resolve(root, 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')
const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')

describe('Master fader — fixed left rail (LightKey screenshots 8.54.48 / 8.57.25)', () => {
  it('is a fixed 96px rail, full height of the Live area', () => {
    expect(css).toContain('.live-master-rail {')
    expect(css).toContain('width: 96px')
    expect(css).toContain('flex: 0 0 96px')
    expect(css).toContain('align-self: stretch')
    expect(css).toContain(".live-master-rail input[type='range'] {")
    expect(css).toContain('flex: 1')
    expect(css).toContain('width: 56px')
    expect(workspace).toContain('live-master-rail')
    expect(workspace).toContain('aria-label="Master fader"')
    expect(workspace).toContain('aria-label="Live master"')
    expect(workspace).toContain('setMaster(Number(e.target.value))')
    // The value reads "Full" at 100%, as in LightKey — not a separate label.
    expect(workspace).toContain("master >= 255 ? 'Full'")
    expect(workspace).not.toContain('flex w-14 shrink-0 flex-col items-center gap-1 rounded border border-line bg-panel2 py-2')
  })

  it('sits outside the canvas scroll container, so canvas pan/zoom/edit cannot move it', () => {
    const railAt = workspace.indexOf('live-master-rail')
    const canvasAt = workspace.indexOf("min-w-0 flex-1 overflow-auto rounded border border-line")
    expect(railAt).toBeGreaterThan(-1)
    expect(canvasAt).toBeGreaterThan(-1)
    expect(railAt).toBeLessThan(canvasAt)
    // The rail renders even when the page is blank.
    const blankAt = workspace.indexOf('This Live page is blank')
    expect(railAt).toBeLessThan(blankAt)
  })

  it('has the tap-tempo BPM box directly underneath, same width', () => {
    expect(workspace).toContain('live-master-bpm')
    expect(workspace).toContain('aria-label="Tap tempo"')
    expect(workspace).toContain('calculateTapTempo(masterTaps.current')
    expect(workspace).toContain('setBpm(result.bpm)')
    expect(css).toContain('.live-master-bpm {')
    expect(css).toContain('width: 100%')
    // The BPM box comes after the fader in the rail.
    expect(workspace.indexOf('aria-label="Live master"')).toBeLessThan(workspace.indexOf('aria-label="Tap tempo"'))
  })
})

describe('Fixture faders — LightKey-narrow (screenshot 8.58.26)', () => {
  it('caps every Design channel column at 64px instead of stretching', () => {
    expect(css).toContain('.chan {')
    expect(css).toContain('width: 64px')
    expect(css).toContain('flex: 0 0 64px')
    expect(design).toContain('className="chan h-full min-w-7"')
    expect(design).not.toContain('className="chan h-full min-w-7 flex-1"')
    // Many channels scroll horizontally instead of squeezing.
    expect(design).toContain('overflow-x-auto')
  })

  it('makes the Dimmer column the same 64px width', () => {
    expect(design).toContain('flex w-16 shrink-0 flex-col items-center gap-0.5')
    expect(design).not.toContain('flex w-14 shrink-0 flex-col items-center gap-0.5')
  })

  it('leaves Live cue faders alone — they are horizontal level controls inside buttons, not vertical faders', () => {
    expect(workspace).toContain("control.type === 'fader' ?")
  })
})
