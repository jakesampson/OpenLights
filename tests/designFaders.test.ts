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
  it('does not render Fanning anywhere in DesignTab', () => {
    expect(design).not.toContain('FanningEditor')
    expect(design).not.toContain('Fanning')
    expect(design).not.toContain('<details')
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

describe('fixture header has no separator', () => {
  it('renders "1 fixture selected" with no rule underneath it', () => {
    expect(design).toContain('fixture')
    expect(design).toContain('selected')
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
    expect(design).toContain("onChange={(next) => updateValues({ intensity: next })}")
    expect(design).toContain("onChange={(next) => updateValues({ [attribute]: next })}")
    expect(design).toContain('disabled={!canEdit || !dimmerSupported}')
    expect(design).toContain('disabled={!canEdit}')
  })

  it('keeps the value readouts and the colour wheel untouched', () => {
    expect(design).toContain('Math.round((dimmer / 255) * 100)}%')
    expect(design).toContain('RGB ${colorValues.red}')
    expect(design).toContain('className="wheel-input"')
    expect(design).toContain('colorWheelPosition')
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
