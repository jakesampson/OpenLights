// LightKey's round Color control (Guide p.82–86; Jake's LightKey
// screenshot Screenshot_2026-11-19_at_9.56.05_am.png): the outer hue
// ring, saturation and brightness as inner arcs — and nothing else in
// the wheel. Additional colour channels (White / Amber / UV / lime)
// are sliders beside the wheel (Guide pp.85–86, verified by Jake in
// LightKey 19 Nov 2026), with no sliders for a fixture without them.
// Source assertions (no DOM renderer), in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const wheel = readFileSync(resolve(root, 'src/renderer/src/components/ColorWheelControl.tsx'), 'utf8')
const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')

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
    // No extra-channel drag path: the wheel has only hue, saturation
    // and brightness — White / Amber / UV are sliders beside it.
    expect(wheel).not.toContain('onExtraChange')
    expect(wheel).not.toContain('extraChannels')
  })
})

describe('DesignTab — the wheel is the colour control', () => {
  it('drives the wheel from HSV and feeds changes back through setColor', () => {
    expect(design).toContain('<ColorWheelControl')
    expect(design).toContain('hsv={hsv}')
    // The wheel HSV comes from the base colour only — White / Amber must
    // not move the arcs (Jake, 19 Nov 2026); the centre disc still shows
    // the mixed colour.
    expect(design).toContain('rgbToHsv(baseColorValues)')
    expect(design).not.toContain('rgbToHsv(colorValues)')
    expect(design).toContain('centreHex={colorHex(colorValues)}')
    // The wheel's own hue/sat/brightness are preserved independently
    // (displayHsv) — the handler records them before writing the colour.
    expect(design).toContain('setPreservedHsv({ h: next.h, s: next.s, v: next.v })')
    expect(design).toContain('setColor(rgbToHex(hsvToRgb(next.h, next.s, next.v)))')
    expect(design).toContain('onCentrePick={(hex) => {')
  })

  it('defaults saturation and brightness to 100% for a black fixture', () => {
    // Jake, 19 Nov 2026: the wheel must work immediately on a black
    // fixture instead of starting dead at 0/0 — the preserved state is
    // initialised (and re-synced on selection change) to 100/100.
    expect(design).toContain('s: rawHsv.s > 0 ? rawHsv.s : 100, v: rawHsv.v > 0 ? rawHsv.v : 100')
    expect(design).toContain('setPreservedHsv((prev) => ({ ...prev, s: 100, v: 100 }))')
  })

  it('draws no outline box around the active arc', () => {
    // Jake, 19 Nov 2026 (image-9.png): the focused arc's bounding-box
    // outline drew a white box around the active zone while dragging.
    // No focus-visible outline on the arc sliders, and an explicit
    // outline: none so no UA default can draw one either. The wheel
    // wrapper keeps its circular focus ring (see index.css).
    expect(css).not.toContain('.color-wheel [role="slider"]:focus-visible')
    expect(css).toContain('.color-wheel [role="slider"]')
    expect(css).toContain('outline: none')
  })

  it('renders White / Amber / UV as sliders beside the wheel, only for fixtures that have them', () => {
    // Guide pp.85–86 + Jake's LightKey check 19 Nov 2026: additional
    // colours are "sliders next to the main color control", and "if no
    // sliders are visible then the selected fixtures don't support
    // these features" — so one slider per additional colour channel
    // the fixtures actually have, in the colour block beside the
    // wheel, and none for a fixture without them.
    expect(design).toContain("const ADDITIONAL_COLOUR_ATTRIBUTES = ['white', 'amber', 'uv', 'lime']")
    expect(design).toContain('commonAttributes.filter((a) => ADDITIONAL_COLOUR_ATTRIBUTES.includes(a))')
    expect(design).toContain('additionalColourAttributes.map((attribute) => {')
    expect(design).toContain("onChange={(next) => updateValues({ [attribute]: next })}")
    // The wheel itself takes no extra channels any more.
    expect(design).not.toContain('extraChannels=')
    expect(design).not.toContain('onExtraChange')
    expect(wheel).not.toContain('extraChannels')
    expect(wheel).not.toContain('onExtraChange')
  })

  it('removes the per-channel colour faders when the wheel is shown', () => {
    // Red/Green/Blue faders are gone — the wheel owns colour, and
    // White/Amber/UV/lime are sliders beside the wheel, not channel
    // faders in the strip — but a fixture the wheel does not support
    // keeps its faders as the fallback.
    expect(design).toContain("const COLOUR_FADER_ATTRIBUTES = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white', 'amber', 'uv', 'lime']")
    expect(design).toContain('const faderAttributes = colorSupported')
    expect(design).toContain('channelAttributes.filter((attribute) => !COLOUR_FADER_ATTRIBUTES.includes(attribute))')
    expect(design).toContain('faderAttributes.map((attribute) => {')
    expect(design).not.toContain('className="wheel-input"')
  })

  it('colours the UV slider violet and labels it UV', () => {
    expect(design).toContain("case 'uv': return '#a855f7'")
    expect(design).toContain("if (attribute === 'uv') return 'UV'")
  })
})
