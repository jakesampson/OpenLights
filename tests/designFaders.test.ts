// Design panel cleanup (Jake, 18 Nov 2026, screenshot 10.38.05):
// Fanning is not in LightKey's Design panel, so it is removed from
// DesignTab (model/store kept); the separator under "1 fixture selected"
// is gone; and the Dimmer and Red/Green/Blue channel faders use the same
// LightKey-style solid fill bar as the Master fader, via the shared
// FillFader component. Source/wiring assertions (no DOM renderer),
// in the repo's style.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')
const fillFader = readFileSync(resolve(root, 'src/renderer/src/components/FillFader.tsx'), 'utf8')
const masterFader = readFileSync(resolve(root, 'src/renderer/src/components/MasterFader.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')
const store = readFileSync(resolve(root, 'src/renderer/src/stores/showStore.ts'), 'utf8')

describe('Fanning removed from the Design panel', () => {
  it('has no Fan… button — fanning lives on each property control', () => {
    expect(design).not.toContain('FanningEditor')
    expect(design).not.toContain('<details')
    expect(design).not.toContain('FanningHud')
    expect(design).not.toContain('>Fan…')
    // Per-property entry points (LightKey Guide §8, p.119): each
    // property's control dispatches the HUD event for its own property.
    expect(design).toContain("dispatchFanHud({ attribute: 'intensity' })")
    expect(design).toContain("dispatchFanHud({ attribute: 'color' })")
    expect(design).toContain("dispatchFanHud({ attribute: 'pan' })")
    expect(design).toContain("dispatchFanHud({ attribute: 'tilt' })")
    expect(design).toContain('dispatchFanHud({ attribute })')
  })

  it('deletes the FanningEditor component file', () => {
    expect(existsSync(resolve(root, 'src/renderer/src/components/FanningEditor.tsx'))).toBe(false)
  })

  it('keeps the fanning model and store — only the panel UI goes', () => {
    expect(existsSync(resolve(root, 'src/renderer/src/lib/fanning.ts'))).toBe(true)
    expect(store).toContain('saveFan')
    expect(store).toContain('deleteFan')
  })
})

describe('fixture header strip is gone', () => {
  it('no longer renders the selection title or the cue-contents strip', () => {
    expect(design).not.toContain('aria-label="Cue contents"')
    expect(design).not.toContain('aria-label="Add preset to cue"')
    expect(design).not.toContain('aria-label="Add sequence to cue"')
    expect(design).not.toContain('Select fixture(s) on stage')
    expect(design).not.toContain('fixture${selectedFixtures.length')
    expect(design).not.toContain('Editing preset “')
    expect(design).not.toContain('border-b border-line')
    expect(design).not.toContain('border-b')
  })
})

describe('Dimmer and channel faders share the Master fill-bar style', () => {
  it('renders the shared FillFader for Dimmer and for channels', () => {
    expect(design).toContain("import { FillFader } from './FillFader'")
    expect(design).toContain('<FillFader')
    // Dimmer: lavender like the Master; channels: the channel colour.
    expect(design).toContain('label="Dimmer for selected fixtures"')
    expect(design).toContain('fillColor="#d9d4f5"')
    expect(design).toContain('fillColor={channelFillColor(attribute)}')
    expect(design).toContain("case 'red': return '#ef4444'")
    expect(design).toContain("case 'green': return '#22c55e'")
    expect(design).toContain("case 'blue': return '#3b82f6'")
  })

  it('no longer uses the old thin-line + knob range inputs', () => {
    expect(design).not.toContain('fader-input')
    expect(design).not.toContain('chan-input')
    expect(design).not.toContain('chan-track')
    expect(design).not.toContain('chan-fill')
    expect(design).not.toContain('type="range"')
    expect(css).not.toContain('.fader-input')
    expect(css).not.toContain('.chan-input')
    expect(css).not.toContain('.chan-track')
  })

  it('still wires Dimmer and channels to the same store updates', () => {
    // The Dimmer writes intensity through updateValues — plus the
    // guide's auto-open (Guide p.98): a non-zero Dimmer opens a closed
    // shutter, so the onChange is a block now, not a one-liner (batch 4,
    // 19 Nov 2026).
    expect(design).toContain('updateValues({ intensity: next })')
    expect(design).toContain("updateValues({ intensity: next, [shutterChannel.attribute]: open })")
    expect(design).toContain("onChange={(next) => updateValues({ [attribute]: next })}")
    // The Dimmer fader is available for a fixture with a dimmer channel
    // and for a virtual-dimmer fixture (colour, no dimmer channel).
    expect(design).toContain('disabled={!canEdit || !dimmerAvailable}')
    expect(design).toContain('disabled={!canEdit}')
  })

  it('keeps the value readouts and the colour wheel, with no RGB text readout', () => {
    expect(design).toContain('Math.round((dimmer / 255) * 100)}%')
    // The wheel is LightKey's round control now (outer hue ring, inner
    // arcs) — the native colour input + marker are gone.
    expect(design).toContain('<ColorWheelControl')
    expect(design).toContain('rgbToHsv(baseColorValues)')
    expect(design).not.toContain('className="wheel-input"')
    expect(design).not.toContain('colorWheelPosition')
  })

  it('has no RGB readout under the colour wheel (Jake, 19 Nov 2026)', () => {
    // The green channel printed a raw float (9.450000000000001, from
    // amber × 0.45 in colorValues) and the long value broke the panel
    // layout — Jake's call was to remove the readout entirely, not
    // round it. The wheel + marker show the colour.
    // (The word RGB still appears in a code comment explaining this;
    // what must be gone is the rendered readout itself.)
    expect(design).not.toContain('RGB ${')
    expect(design).not.toContain('RGB —')
  })

  it('every other readout in the panel is already an integer', () => {
    // Audit, same batch: Dimmer % is Math.round'd; Pan/Tilt and the
    // channel values all go through valueFor, which rounds — so no
    // other raw float can be rendered into the panel.
    expect(design).toContain('Math.round((dimmer / 255) * 100)}%')
    expect(design).toContain("Pan {activeCue ? valueFor('pan') : 0} · Tilt {activeCue ? valueFor('tilt') : 0}")
    expect(design).toContain('const value = activeCue ? valueFor(attribute) : 0')
    expect(design).toContain('Math.round(')
  })

  it('the Master uses the same shared component', () => {
    expect(masterFader).toContain("import { FillFader } from './FillFader'")
    expect(masterFader).toContain('<FillFader value={master} onChange={setMaster}')
    expect(masterFader).not.toContain('MasterTrack')
  })
})

describe('FillFader — one style, drag + keyboard, fill from the bottom', () => {
  it('is a slider with a solid bottom-anchored fill', () => {
    expect(fillFader).toContain('role="slider"')
    expect(fillFader).toContain('aria-orientation="vertical"')
    expect(fillFader).toContain('aria-valuemin={0}')
    expect(fillFader).toContain('aria-valuemax={255}')
    expect(fillFader).toContain('aria-valuenow={value}')
    expect(fillFader).toContain("style={{ height: `${(value / 255) * 100}%`")
    expect(fillFader).toContain('backgroundColor: fillColor')
    expect(css).toContain('.design-fill-track {')
    expect(css).toContain('.live-master-track {')
  })

  it('drags by pointer capture and supports keyboard', () => {
    expect(fillFader).toContain('setPointerCapture')
    expect(fillFader).toContain("event.key === 'ArrowUp'")
    expect(fillFader).toContain("event.key === 'Home'")
    expect(fillFader).toContain("event.key === 'End'")
    expect(fillFader).toContain("event.key === 'PageUp'")
    expect(fillFader).toContain('aria-disabled={disabled || undefined}')
  })
})
