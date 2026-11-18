// Master fader rail + fixture fader widths (Jake's 18 Nov screenshots
// 8.54.48 / 8.57.25 / 8.58.26): the Master fader is a narrow rail at the
// far left of the Live area with the BPM box underneath it, and the
// fixture faders are LightKey-narrow (~60–70px including the track).
// Since 18 Nov 2026 (screenshots 10.12.28 / 10.17.25) the column is an
// overlay anchored to the bottom panel itself — top 10px below the panel
// border, filling the panel height — with canvas content scrolling
// underneath it, as in LightKey. Source/CSS assertions (no DOM renderer),
// in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const workspace = readFileSync(resolve(root, 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')
const masterFader = readFileSync(resolve(root, 'src/renderer/src/components/MasterFader.tsx'), 'utf8')
const app = readFileSync(resolve(root, 'src/renderer/src/App.tsx'), 'utf8')
const liveTab = readFileSync(resolve(root, 'src/renderer/src/components/LiveTab.tsx'), 'utf8')
const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')

describe('Master fader — panel-anchored overlay (LightKey screenshots 10.12.28 / 10.17.25)', () => {
  it('is a 96px wide rail with a solid filled track, not a thin line + knob', () => {
    // Jake, 18 Nov 2026 (screenshots 9.56.45 / 10.00.16): LightKey's
    // Master is a tall, wide, solid lavender bar that fills from the
    // bottom — the thin white line + round knob is replaced by a
    // role="slider" track with a fill div whose height is the value.
    expect(css).toContain('.live-master-rail {')
    expect(css).toContain('width: 96px')
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
    expect(workspace).not.toContain('flex w-14 shrink-0 flex-col items-center gap-1 rounded border border-line bg-panel2 py-2')
  })

  it('fills the panel height from 10px below the panel border — it is not a fixed 172px box', () => {
    // Jake, 18 Nov 2026 (screenshot 10.12.28): the rail rendered as a
    // small squat box low in the panel, with the BPM button clipped at
    // the panel's bottom edge. Two causes, both in the rail rule itself:
    // the rail was a fixed 172px tall inside a row shorter than the
    // 172px rail + BPM button, so the button was pushed below the fold;
    // and the rail carried `flex: 0 0 96px`, which inside the
    // column-direction flex container set its HEIGHT basis to 96px and
    // overrode the 172px height — the squashed square in the screenshot.
    // The rail is now the flexible part of a column anchored to the panel
    // (see the overlay test below): no fixed height, no 96px flex basis.
    const railRules = css.split('.live-master-rail {').length - 1
    expect(railRules).toBe(1)
    const railBlock = css.slice(css.indexOf('.live-master-rail {'), css.indexOf('}', css.indexOf('.live-master-rail {')))
    expect(railBlock).toContain('flex: 1 1 auto')
    expect(railBlock).toContain('min-height: 0')
    expect(railBlock).not.toContain('height: 172px')
    expect(railBlock).not.toContain('flex: 0 0 96px')
    expect(railBlock).not.toContain('align-self: flex-start')
    // The rail is rendered once, in the column component.
    expect(masterFader.match(/live-master-rail/g)?.length).toBe(1)
  })

  it('is an overlay anchored to the bottom panel, above the scrolling canvas', () => {
    // Jake, 18 Nov 2026 (screenshot 10.17.25): in LightKey the Master
    // sits on top of the scrolling content — buttons disappear underneath
    // it — and it is always accessible, never moved by any scrolling.
    // The column is a direct child of the bottom panel shell (App.tsx),
    // absolutely positioned against it: top 9px below the panel border
    // (9px + the 1px panel border = 10px below the panel's outer edge, as
    // Jake asked) and 9px above the bottom border, so the BPM button is
    // fully inside the panel, never clipped. z-index 20 puts it above the
    // scrolling canvas content but below the Design/Live switch row
    // (z-index 30), so the Live menu always opens over it.
    expect(css).toContain('.bottom-panel-shell {')
    const shellBlock = css.slice(css.indexOf('.bottom-panel-shell {'), css.indexOf('}', css.indexOf('.bottom-panel-shell {')))
    expect(shellBlock).toContain('position: relative;')
    expect(css).toContain('.bottom-panel-shell > .live-master-column {')
    const overlayBlock = css.slice(css.indexOf('.bottom-panel-shell > .live-master-column {'), css.indexOf('}', css.indexOf('.bottom-panel-shell > .live-master-column {')))
    expect(overlayBlock).toContain('position: absolute;')
    expect(overlayBlock).toContain('left: 10px;')
    expect(overlayBlock).toContain('top: 9px;')
    expect(overlayBlock).toContain('bottom: 9px;')
    expect(overlayBlock).toContain('z-index: 20;')
    // App renders the column in the shell, before the switch row and the
    // workspace — in Live only (Design keeps BottomPlayback).
    expect(app).toContain('{tab === \'Live\' && <MasterFader master={master} setMaster={setMaster} bpm={bpm} onTap={tapTempo} />')
    const shellAt = app.indexOf('bottom-panel-shell')
    const columnAt = app.indexOf('<MasterFader')
    const switchAt = app.indexOf('bottom-panel-switch')
    const bodyAt = app.indexOf('bottom-panel-body')
    expect(columnAt).toBeGreaterThan(shellAt)
    expect(columnAt).toBeLessThan(switchAt)
    expect(columnAt).toBeLessThan(bodyAt)
    // The workspace itself no longer renders the column at all.
    expect(workspace.indexOf('<MasterFader')).toBe(-1)
    expect(workspace).not.toContain('live-master-column')
  })

  it('keeps the same height in Live Edit mode — its height comes from the panel, not the canvas', () => {
    // The old regression (screenshot 9.23.32): the rail stretched with the
    // edit canvas because its height came from the Live section. Now the
    // column's height is set by the panel shell (top/bottom insets above),
    // the shell's height is fixed by the 294px bottom grid, and the rail
    // is rendered once with no editing-gated branch — so Live and Live
    // Edit get the identical column.
    expect(css).toContain('height: 294px')
    expect(app).not.toContain('editing && <MasterFader')
    expect(app).not.toContain('liveEditing && <MasterFader')
    expect(workspace.indexOf('<MasterFader')).toBe(-1)
  })

  it('lets canvas content flow underneath it when scrolled', () => {
    // At rest the workspace takes a 98px left inset (column spans 10–106px
    // from the shell's content left edge; workspace content starts 18px in;
    // 106 − 18 + 10 = 98px), so page content starts 10px clear of the
    // column. The inset on the scroll container is inside its scrollport,
    // so scrolled content slides underneath the column, as in LightKey.
    expect(app).toContain('<LiveWorkspace masterOverlay />')
    expect(workspace).toContain('export function LiveWorkspace({ masterOverlay = false }')
    expect(workspace.match(/master-overlay-inset/g)?.length).toBe(3)
    expect(css).toContain('.master-overlay-inset {')
    expect(css).toContain('padding-left: 98px;')
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
    expect(app).toContain('calculateTapTempo(headerTaps.current')
    expect(app).toContain('setBpm(result.bpm)')
    expect(css).toContain('.live-master-bpm {')
    expect(css).toContain('width: 96px')
    // The BPM box comes after the fader.
    expect(masterFader.indexOf('aria-label="Live master"')).toBeLessThan(masterFader.indexOf('aria-label="Tap tempo"'))
  })

  it('still renders in the separate Live window, beside the workspace', () => {
    // LiveTab has no bottom panel to anchor an overlay to, so the column
    // is a flex-row sibling of the workspace there — still outside the
    // canvas scroll container, so canvas pan/zoom/edit cannot move it.
    expect(liveTab).toContain('<MasterFader master={master} setMaster={setMaster} bpm={bpm} onTap={tapTempo} />')
    expect(liveTab.indexOf('<MasterFader')).toBeLessThan(liveTab.indexOf('<LiveWorkspace />'))
    expect(liveTab).not.toContain('masterOverlay')
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
