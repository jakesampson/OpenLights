// LightKey's round Color control (Guide p.82–85; Jake's LightKey
// screenshot Screenshot_2026-11-19_at_9.56.05_am.png): the outer hue
// ring, saturation and brightness as inner arcs, and one inner arc per
// additional colour channel the fixture has — White / Amber / UV — with
// no extra arcs for a fixture without them. Source assertions (no DOM
// renderer), in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const wheel = readFileSync(resolve(root, 'src/renderer/src/components/ColorWheelControl.tsx'), 'utf8')
const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')

describe('ColorWheelControl — LightKey’s round control', () => {
  it('has an outer hue ring with ticks and six triangle markers', () => {
    expect(wheel).toContain('annulusSector(97, 77')
    expect(wheel).toContain('hsl(${deg}, 100%, 50%)')
    expect(wheel).toContain('const triangles = [0, 60, 120, 180, 240, 300]')
    expect(wheel).toContain('<polygon')
    // The current hue is a white bar on the ring.
    expect(wheel).toContain('Current hue marker')
    expect(wheel).toContain('stroke="#fff"')
  })

  it('lays the inner arcs out as saturation left, brightness right', () => {
    // Guide p.82–84: hue is the outer ring, saturation the left inner
    // slider, brightness the right inner slider. The arcs divide the
    // inner circle equally, starting at 180° — so with two arcs the
    // first (saturation) is the left half and the second (brightness)
    // the right half, exactly as in Jake's screenshot.
    const satAt = wheel.indexOf("key: 'saturation'")
    const brightAt = wheel.indexOf("key: 'brightness'")
    expect(satAt).toBeGreaterThan(-1)
    expect(brightAt).toBeGreaterThan(satAt)
    expect(wheel).toContain('const arcStart = (index: number) => 180 + index * span')
    expect(wheel).toContain("maxColor: `hsl(${hsv.h}, 100%, 50%)`")
    expect(wheel).toContain("minColor: `hsl(${hsv.h}, 0%, 50%)`")
    expect(wheel).toContain("minColor: '#000000'")
  })

  it('gives every inner arc its own value marker and keyboard control', () => {
    expect(wheel).toContain('role="slider"')
    expect(wheel).toContain('aria-label={arc.label}')
    expect(wheel).toContain('aria-valuenow={value}')
    expect(wheel).toContain('onKeyDownArc')
    expect(wheel).toContain('markerAngle')
  })

  it('opens the system colour window from the centre disc', () => {
    // Guide p.84: "Click the current color in the center of the color
    // control. The system color window opens."
    expect(wheel).toContain('type="color"')
    expect(wheel).toContain('onCentrePick(event.target.value)')
    expect(wheel).toContain('aria-label="Colour — open system colour picker"')
  })

  it('is draggable on the hue ring and on each inner arc', () => {
    // The zone is computed once on pointerdown (hue ring vs arc) and
    // stored in the ref (and in dragZone state, for the marker/popup).
    expect(wheel).toContain("const zone: { type: 'hue' } | { type: 'arc'; index: number }")
    expect(wheel).toContain("? { type: 'hue' }")
    expect(wheel).toContain("{ type: 'arc', index:")
    expect(wheel).toContain('activeZone.current = zone')
    expect(wheel).toContain('onHsvChange({ h: Math.round(point.angle)')
    expect(wheel).toContain('onExtraChange(arc.attribute, Math.round(fraction * 255))')
  })
})

describe('DesignTab — the wheel is the colour control', () => {
  it('drives the wheel from HSV and feeds changes back through setColor', () => {
    expect(design).toContain('<ColorWheelControl')
    expect(design).toContain('hsv={hsv}')
    expect(design).toContain('rgbToHsv(colorValues)')
    // The wheel's own hue/sat are preserved independently of brightness
    // (displayHsv) — the handler records them before writing the colour.
    expect(design).toContain('setPreservedHsv({ h: next.h, s: next.s })')
    expect(design).toContain('setColor(rgbToHex(hsvToRgb(next.h, next.s, next.v)))')
    expect(design).toContain('onCentrePick={(hex) => {')
  })

  it('shows inner arcs only for additional colour channels the fixtures have', () => {
    expect(design).toContain("const ADDITIONAL_COLOUR_ATTRIBUTES = ['white', 'amber', 'uv', 'lime']")
    expect(design).toContain('commonAttributes.filter((a) => ADDITIONAL_COLOUR_ATTRIBUTES.includes(a))')
    expect(design).toContain('extraChannels={additionalColourAttributes.map((attribute) => ({')
    expect(design).toContain('onExtraChange={(attribute, next) => updateValues({ [attribute]: next })}')
  })

  it('removes the per-channel colour faders when the wheel is shown', () => {
    // Red/Green/Blue/White/Amber/Uv faders are gone — the wheel owns
    // colour — but a fixture the wheel does not support keeps its
    // faders as the fallback.
    expect(design).toContain("const COLOUR_FADER_ATTRIBUTES = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white', 'amber', 'uv', 'lime']")
    expect(design).toContain('const faderAttributes = colorSupported')
    expect(design).toContain('channelAttributes.filter((attribute) => !COLOUR_FADER_ATTRIBUTES.includes(attribute))')
    expect(design).toContain('faderAttributes.map((attribute) => {')
    expect(design).not.toContain('className="wheel-input"')
  })

  it('colours the UV arc violet', () => {
    expect(design).toContain("case 'uv': return '#a855f7'")
  })
})
