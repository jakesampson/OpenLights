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
const masterFader = readFileSync(resolve(root, 'src/renderer/src/components/MasterFader.tsx'), 'utf8')
const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')

describe('Master fader — fixed left rail (LightKey screenshots 8.54.48 / 8.57.25)', () => {
  it('is a fixed 96px wide, 172px tall rail with a solid filled track, not a thin line + knob', () => {
    // Jake, 18 Nov 2026 (screenshots 9.56.45 / 10.00.16): LightKey's
    // Master is a tall, wide, solid lavender bar that fills from the
    // bottom — the thin white line + round knob is replaced by a
    // role="slider" track with a fill div whose height is the value.
    expect(css).toContain('.live-master-rail {')
    expect(css).toContain('width: 96px')
    expect(css).toContain('flex: 0 0 96px')
    expect(css).toContain('height: 172px')
    expect(css).toContain('align-self: flex-start')
    expect(css).toContain('.live-master-track {')
    expect(css).toContain('width: 64px')
    expect(css).toContain('.live-master-fill {')
    expect(css).toContain('background: #d9d4f5')
    expect(css).not.toContain(".live-master-rail input[type='range']")
    expect(masterFader).toContain('live-master-rail')
    expect(masterFader).toContain('aria-label="Master fader"')
    expect(masterFader).toContain('role="slider"')
    expect(masterFader).toContain('aria-label="Live master"')
    expect(masterFader).toContain('aria-valuenow={value}')
    expect(masterFader).toContain('live-master-fill')
    expect(masterFader).toContain("height: `${(value / 255) * 100}%`")
    // Dragging still sets the same store master (0–255) through setMaster.
    expect(masterFader).toContain('setPointerCapture')
    expect(masterFader).toContain('onChange(clampMaster(')
    // The value reads "Full" at 100%, as in LightKey — not a separate label.
    expect(masterFader).toContain("master >= 255 ? 'Full'")
    expect(workspace).toContain('<MasterFader master={master} setMaster={setMaster} bpm={bpm} onTap={tapTempo} />')
    expect(workspace).not.toContain('flex w-14 shrink-0 flex-col items-center gap-1 rounded border border-line bg-panel2 py-2')
  })

  it('keeps the same fixed height in Live Edit mode — it never stretches', () => {
    // Jake, 18 Nov 2026 (screenshot 9.23.32): toggling Edit on stretched
    // the Master fader to the full height of the edit area. Root cause:
    // the rail used align-self: stretch, and in Edit mode the Live section
    // grows taller than the 260px bottom grid row (the page inspector and
    // the 520px canvas force it taller), so the rail stretched with it.
    // The fix is a fixed height on the rail itself, not a cap on the
    // section — so there must be exactly one rail rule, with that fixed
    // height, and no stretch or full-height rule anywhere.
    const railRules = css.split('.live-master-rail {').length - 1
    expect(railRules).toBe(1)
    const railBlock = css.slice(css.indexOf('.live-master-rail {'), css.indexOf('}', css.indexOf('.live-master-rail {')))
    expect(railBlock).toContain('height: 172px')
    expect(railBlock).toContain('align-self: flex-start')
    expect(railBlock).not.toContain('align-self: stretch')
    expect(railBlock).not.toContain('height: 100%')
    // The rail is rendered once, outside any editing-gated block: the
    // same rail shows in Live and in Live Edit.
    expect(masterFader.match(/live-master-rail/g)?.length).toBe(1)
    expect(workspace.indexOf('<MasterFader')).toBeLessThan(workspace.indexOf('This Live page is blank'))
  })

  it('sits outside the canvas scroll container, so canvas pan/zoom/edit cannot move it', () => {
    const railAt = workspace.indexOf('<MasterFader')
    const canvasAt = workspace.indexOf('min-w-0 flex-1 overflow-auto')
    expect(railAt).toBeGreaterThan(-1)
    expect(canvasAt).toBeGreaterThan(-1)
    expect(railAt).toBeLessThan(canvasAt)
    // The rail renders even when the page is blank.
    const blankAt = workspace.indexOf('This Live page is blank')
    expect(railAt).toBeLessThan(blankAt)
  })

  it('has the tap-tempo BPM box as a separate element underneath the rail, same width', () => {
    // Jake, 18 Nov 2026 (screenshot 10.00.16, yellow square): the BPM
    // box is its own element directly under the rail — not inside the
    // rail, not overlapping the fader track. It is a separate BpmButton
    // rendered after the rail inside the same 96px column.
    expect(masterFader).toContain('live-master-column')
    expect(masterFader).toContain('live-master-bpm')
    expect(masterFader).toContain('aria-label="Tap tempo"')
    expect(masterFader).toContain('<BpmButton bpm={bpm} onTap={onTap} />')
    expect(masterFader.indexOf('<BpmButton bpm={bpm}')).toBeGreaterThan(masterFader.indexOf('aria-label="Master fader"'))
    expect(workspace).toContain('calculateTapTempo(masterTaps.current')
    expect(workspace).toContain('setBpm(result.bpm)')
    expect(css).toContain('.live-master-bpm {')
    expect(css).toContain('width: 96px')
    // The BPM box comes after the fader.
    expect(masterFader.indexOf('aria-label="Live master"')).toBeLessThan(masterFader.indexOf('aria-label="Tap tempo"'))
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
