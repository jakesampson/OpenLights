import { useEffect, useRef, useState } from 'react'
import type { FanDef, FixtureDef } from '@shared/types'
import { fixtureBeams, fixtureMode } from '@shared/fixtureProfiles'
import { resolveCueValues } from '@shared/cueResolution'
import { availableProperties } from '../lib/availableProperties'
import { fixtureAttributes } from '../lib/automationRuntime'
import { findAutoProgram, programSlotForValue, programSpeedRange } from '../lib/autoProgram'
import { findShutterChannel, shutterSpeedForValue, shutterStateForValue, shutterValueForState, valueAtSpeed, type ShutterState } from '../lib/shutterStrobe'
import { wheelSlotValue } from '../lib/wheelProperties'
import { hexToRgb, rgbToHex, colorChannels } from '../lib/colorMix'
import { displayHsv, hsvToRgb, rgbToHsv } from '../lib/colorWheel'
import { useShowStore, defaultFixtureValues } from '../stores/showStore'
import { ColorWheelControl } from './ColorWheelControl'
import { EffectEditor, EffectIndicator, EffectsChooser } from './EffectEditor'
import { FillFader } from './FillFader'
import { PositionControl } from './PositionControl'
import { positionDegrees, positionFractions } from '../lib/position'
import { dispatchFanHud, FanDeleteDot, FanMenuButton, FannedIcon } from './PropertyFan'

const POSITION_ATTRIBUTES = ['pan', 'tilt', 'panFine', 'tiltFine']

// Colour attributes the round Color control owns (LightKey Guide p.82–
// 86): Red/Green/Blue (or Cyan/Magenta/Yellow) are driven by the hue
// wheel, and the additional colour channels by the sliders beside it —
// so they are not rendered as channel faders when the wheel is shown.
// A fixture the wheel does not support keeps its faders as the fallback.
const COLOUR_FADER_ATTRIBUTES = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white', 'amber', 'uv', 'lime']
// Additional colour channels (Guide pp.85–86: cool/warm white, amber,
// lime, ultraviolet) that appear as sliders beside the wheel — only
// when the selected fixtures actually have them. A fixture without
// them shows no sliders at all.
const ADDITIONAL_COLOUR_ATTRIBUTES = ['white', 'amber', 'uv', 'lime']

function attributeLabel(attribute: string) {
  if (attribute === 'uv') return 'UV'
  return attribute.charAt(0).toUpperCase() + attribute.slice(1)
}

// A beam owns the colour attributes (bare or per-beam numbered, e.g.
// `red`, `red2`); every other attribute belongs to the fixture, so with
// a beam selected those still read from — and write to — the fixture.
// Otherwise the Dimmer reads 0 with a beam selected and its drags go
// nowhere (Jake, 20 Nov 2026).
const COLOUR_ATTRIBUTE_BASES = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white', 'amber', 'uv', 'lime']
function isColourAttribute(attribute: string) {
  return COLOUR_ATTRIBUTE_BASES.some((base) => attribute === base || (attribute.startsWith(base) && /^\d+$/.test(attribute.slice(base.length))))
}

// The selected Design control (Jake, 19 Nov 2026): the blue #0A84FF
// border marks the one control the shortcuts act on, so you can see
// which value the arrow keys will adjust. Clicking a control selects
// it; clicking spare space in the panel clears it. The wheel is one
// control ('colour' — the whole card); each fader is its own.
type SelectedDesignControl = 'colour' | 'dimmer' | 'shutter' | 'autoProgram' | 'autoProgramSpeed' | `slider:${string}` | `channel:${string}` | `beam1:${string}`

// The colour card's active property — the last colour property the
// user adjusted (LightKey's card header, Jake's LightKey screenshots
// 19 Nov 2026). Null is the idle state: the card shows "Color" with
// no value.
type ActiveColorProperty = 'hue' | 'saturation' | 'brightness' | 'white' | 'amber' | 'uv' | 'lime'

// LightKey's name for an additional-colour property in the card header
// (Guide p.85; Jake's screenshots 19 Nov 2026): White is "Cool White",
// UV is "Ultraviolet" — not the slider labels "White" / "UV".
function colorPropertyHeaderName(property: ActiveColorProperty): string {
  switch (property) {
    case 'hue': return 'Hue'
    case 'saturation': return 'Saturation'
    case 'brightness': return 'Brightness'
    case 'white': return 'Cool White'
    case 'amber': return 'Amber'
    case 'uv': return 'Ultraviolet'
    case 'lime': return 'Lime'
  }
}

// A percent value as LightKey's card header shows it (Jake's
// screenshots 19 Nov 2026; his choice, 19 Nov 2026): "Off" at 0,
// "Full" at 100, otherwise the number with a space before the %
// ("98 %"). Hue is degrees, not a percent — it never uses this.
function percentHeaderText(percent: number): string {
  if (percent <= 0) return 'Off'
  if (percent >= 100) return 'Full'
  return `${Math.round(percent)} %`
}

// Fill colour for a channel fader: the fill follows the channel, like the
// colour it controls — red/green/blue (and cyan/magenta/yellow/white/amber
// for CMY/white/amber fixtures). The Dimmer uses the Master's lavender.
// Any other attribute falls back to the theme accent.
// The fill follows the channel, not the beam index (Jake, 20 Nov 2026,
// image-17): per-beam attributes ('red2' built-in, 'red 2' OFL) get the
// same fill as beam 1 — the old exact-match switch left Red 2 through
// Blue 4 on the purple accent fallback.
export function channelFillColor(attribute: string) {
  const base = attribute.replace(/ ?\d+$/, '')
  switch (base) {
    case 'red': return '#ef4444'
    case 'green': return '#22c55e'
    case 'blue': return '#3b82f6'
    case 'cyan': return '#22d3ee'
    case 'magenta': return '#e879f9'
    case 'yellow': return '#eab308'
    case 'white': return '#e5e7eb'
    case 'amber': return '#f59e0b'
    case 'uv': return '#a855f7'
    case 'lime': return '#84cc16'
    default: return 'var(--accent)'
  }
}

// The 2×2 grid slots beside the colour wheel, in LightKey's positions
// (lightkey-colour-wheel-*.png, 19 Nov 2026 — the fixture there has
// White / Amber / UV): White top-left, UV top-right, Amber
// bottom-left, and the fourth (bottom-right) slot empty. Lime takes
// the remaining slot; no LightKey shot shows Lime, so that placement
// is inferred from the pattern, not verified.
const ADDITIONAL_COLOUR_GRID_SLOTS = ['white', 'uv', 'amber', 'lime'] as const

// The grid's four cells in slot order: the fixture's attribute in its
// slot, or null for an empty slot. A fixture with fewer than four
// additional colours keeps its empty slot(s) instead of collapsing.
export function additionalColourSlots(attributes: readonly string[]): (string | null)[] {
  return ADDITIONAL_COLOUR_GRID_SLOTS.map((slot) => (attributes.includes(slot) ? slot : null))
}

// Value gradient for an additional-colour slider (LightKey, colours
// sampled from the strips in lightkey-colour-wheel-*.png): the strip
// runs full colour at the top to black at the bottom — White
// white→black, UV deep blue-violet #1710a0→black, Amber gold
// #dbac46→black. Lime has no LightKey shot; it follows the pattern
// with the lime fill colour (#84cc16).
export function additionalColourFillGradient(attribute: string): string | null {
  switch (attribute) {
    case 'white': return 'linear-gradient(to top, #000000, #ffffff)'
    case 'amber': return 'linear-gradient(to top, #000000, #dbac46)'
    case 'uv': return 'linear-gradient(to top, #000000, #1710a0)'
    case 'lime': return 'linear-gradient(to top, #000000, #84cc16)'
    default: return null
  }
}

function colorHex(values: Record<string, number>) {
  const hex = (attribute: string) =>
    Math.max(0, Math.min(255, Math.round(values[attribute] ?? 0)))
      .toString(16)
      .padStart(2, '0')
  return `#${hex('red')}${hex('green')}${hex('blue')}`
}

export function DesignTab({ effectTabHost, effectToolsHost, chooserLeftHost, chooserSearchHost, movementChartHost }: { effectTabHost?: HTMLElement | null; effectToolsHost?: HTMLElement | null; chooserLeftHost?: HTMLElement | null; chooserSearchHost?: HTMLElement | null; movementChartHost?: HTMLElement | null } = {}) {
  const {
    show,
    cues,
    presets,
    activeCueId,
    activePresetIds,
    selectedFixtureIds,
    selectedBeams,
    updateSelectedBeamValues,
    updateBeamValues,
    updateSelectedFixtures,
    setSelectedColor,
    setSelectedBaseColor,
    setColorDefault,
    loadColorDefault,
    resetColorDefault,
    editingPresetId,
    editingCueAdHocId,
    manualOverrides,
    manualFans,
    updateEditingPresetValues,
    deleteFan,
    effects,
    editingEffectId,
    effectChooserAttribute,
    setEditingEffectId,
    setEffectChooserAttribute,
  } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const activeCue = cues.find((cue) => cue.id === activeCueId)
  // The cue's resolved look (Piece 8): its presets in order, then its
  // ad-hoc values. The panel reads the resolved look, so a property
  // defined by a preset shows in the controls; defined (overridden)
  // properties sit on top of it (Guide ch.8, p.80) — a manual override
  // is what the fixture is actually doing, so the panel shows it.
  // Writes define overrides (below), except while a preset or a cue's
  // ad-hoc layer is being edited, when they write into that stored
  // layer instead.
  const cueValues = activeCue ? resolveCueValues(activeCue, presets, fixtures) : {}
  // The active palette presets, in activation order (later wins) —
  // the same layer the output applies on top of the cue (cue →
  // presets → overrides; see effectiveIntensityLevels). The panel
  // must read it too (Jake, 26 Nov 2026): a fixture lit by an active
  // preset read 0/dark here while the Preview showed it lit.
  const activePresetValues: Record<string, Record<string, number>> = {}
  for (const id of activePresetIds) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) continue
    for (const [fixtureId, patch] of Object.entries(preset.fixtureValues ?? {})) {
      activePresetValues[fixtureId] = { ...activePresetValues[fixtureId], ...patch }
    }
  }
  // In-place preset editing (LightKey, Guide ch.9): the bottom panel edits
  // the preset's own values, not the active cue's. Where the preset does
  // not define an attribute for a fixture, the cue value shows as the
  // starting point; moving a control writes it into the preset.
  const editingPreset = editingPresetId ? presets.find((p) => p.id === editingPresetId) : undefined
  // A property the preset and the cue both leave undefined shows the
  // fixture's default value (LightKey Guide p.114) — for Colour that is
  // blue (Guide p.85), so the wheel reads blue instead of black for an
  // undefined colour. The passed fallback still covers fixtures with no
  // such channel at all (e.g. a dimmer fixture's RGB, which shows 255).
  const fixtureAttr = (fixtureId: string, attribute: string, fallback: number) => {
    const fixture = fixtures.find((f) => f.id === fixtureId)
    // While a preset is being edited the panel reads the preset's own
    // values; otherwise a defined (overridden) property reads first,
    // then the active palette presets, then the cue's resolved look.
    return editingPreset?.fixtureValues[fixtureId]?.[attribute] ?? (editingPreset ? undefined : manualOverrides[fixtureId]?.[attribute]) ?? (editingPreset ? undefined : activePresetValues[fixtureId]?.[attribute]) ?? cueValues[fixtureId]?.[attribute] ?? (fixture ? defaultFixtureValues(fixture)[attribute] : undefined) ?? fallback
  }
  const selectedFixtures = fixtures.filter((fixture) => selectedFixtureIds.includes(fixture.id))
  const beamProperties = selectedBeams.map((b) => { const f = fixtures.find((f) => f.id === b.fixtureId); return f && fixtureMode(f)?.beams?.find((beam) => beam.id === b.beamId)?.properties }).filter((b): b is Record<string, string> => Boolean(b))
  const commonAttributes = beamProperties.length ? Object.keys(beamProperties[0]).filter((key) => beamProperties.every((b) => key in b)) : availableProperties(selectedFixtures).map((property) => property.attribute)
  // A fixture with colour channels but no dimmer channel still gets a
  // working Dimmer in LightKey — the virtual dimmer (Piece 12): the
  // fader writes an intensity value into the cue and the output scales
  // the fixture's LED channels by it.
  const isVirtualDimmer = (fixture: FixtureDef) =>
    !fixtureAttributes(fixture).includes('intensity') && colorChannels(fixtureAttributes(fixture)).length > 0
  // Pan/tilt as LightKey's circular position control (Guide ch.8,
  // pp.90–91: angle around the circle is pan, distance from the centre
  // is tilt) instead of two raw 0–255 sliders — only when every selected
  // fixture has pan+tilt and no individual beam is selected (beam values
  // are keyed by beam property, not by pan/tilt). Otherwise the raw
  // sliders stay as the fallback.
  const hasPanTilt = selectedBeams.length === 0 && selectedFixtures.length > 0 &&
    selectedFixtures.every((fixture) => fixtureAttributes(fixture).includes('pan') && fixtureAttributes(fixture).includes('tilt'))
  // The position the control shows (and the readout under it): the same
  // precedence as every other Design control (fixtureAttr above) — the
  // preset being edited, then a defined (overridden) property, then the
  // active palette presets, then the cue's resolved look — with no
  // fixture-default fallback, so an undefined position still reads
  // exactly home. The old pad read the cue values only, so a drag —
  // which writes an override, never the cue — left the dot and the
  // readout frozen at the cue's position (caught by the real-app
  // probe, 26 Nov 2026).
  const positionAttr = (attribute: 'pan' | 'tilt'): number | undefined => {
    const fixtureId = selectedFixtures[0]?.id
    if (!fixtureId) return undefined
    return editingPreset?.fixtureValues[fixtureId]?.[attribute]
      ?? (editingPreset ? undefined : manualOverrides[fixtureId]?.[attribute])
      ?? (editingPreset ? undefined : activePresetValues[fixtureId]?.[attribute])
      ?? cueValues[fixtureId]?.[attribute]
  }
  const positionNow = selectedFixtures[0] ? positionFractions(
    Object.fromEntries(['pan', 'tilt'].map((attribute) => [attribute, positionAttr(attribute as 'pan' | 'tilt')]).filter(([, value]) => value !== undefined)) as Record<string, number>,
    fixtureAttributes(selectedFixtures[0])) : undefined
  const positionNowDegrees = positionNow ? positionDegrees(positionNow.pan, positionNow.tilt) : undefined
  const channelAttributes = selectedFixtures.length
    ? commonAttributes.filter((attribute) => attribute !== 'intensity' && !(hasPanTilt && POSITION_ATTRIBUTES.includes(attribute)))
    : []
  const canEdit = Boolean(show && selectedFixtures.length > 0)
  // An enabled effect controlling a property (Guide ch.10, p.149): the
  // property's area in Design shows an effect icon instead of its normal
  // controls. Colour effects own the wheel's channels; Position effects
  // own pan and tilt; beam attributes match their base (e.g. 'red 2' is
  // owned by a 'red' effect). Controlling means for THESE fixtures
  // (Jake, 26 Nov 2026): an enabled effect whose fixture list does not
  // cover the selection owns nothing here, so the property keeps its
  // normal controls instead of showing the effect's card. An effect
  // with no fixtures (empty list — Jake, 27 Nov 2026) owns nothing.
  // The effect must cover every selected fixture (or selected beam's
  // fixture) — for a mixed selection the un-owned fixtures keep their
  // editable controls.
  const effectForAttribute = (attribute: string) => {
    const base = attribute.replace(/ ?\d+$/, '')
    const selectedIds = selectedBeams.length > 0
      ? [...new Set(selectedBeams.map((b) => b.fixtureId))]
      : selectedFixtureIds
    return effects.find((effect) =>
      effect.enabled &&
      selectedIds.length > 0 &&
      selectedIds.every((id) => effect.fixtureIds.includes(id)) &&
      (effect.attribute === attribute ||
        effect.attribute === base ||
        (effect.attribute === 'color' && isColourAttribute(attribute)) ||
        (effect.attribute === 'position' && (attribute === 'pan' || attribute === 'tilt')))
    )
  }
  // Open the editor for a property's effect, or the chooser to add one.
  const openEffectFor = (attribute: string) => {
    const existing = effectForAttribute(attribute)
    if (existing) setEditingEffectId(existing.id)
    else setEffectChooserAttribute(attribute)
  }
  const dimmerEffect = effectForAttribute('intensity')
  const colorEffect = effectForAttribute('color')
  const positionEffect = effectForAttribute('position')
  const dimmerSupported = commonAttributes.includes('intensity')
  const previewOnlyColor = selectedFixtures.length > 0 && selectedFixtures.every((fixture) => fixture.type === 'dimmer')
  const valueFor = (attribute: string) => selectedBeams.length ? Math.round(selectedBeams.reduce((sum, b) => { const f = fixtures.find((f) => f.id === b.fixtureId), key = f && fixtureMode(f)?.beams?.find((beam) => beam.id === b.beamId)?.properties[attribute]; return sum + (key ? fixtureAttr(b.fixtureId, key, 0) : !isColourAttribute(attribute) && f && fixtureAttributes(f).includes(attribute) ? fixtureAttr(b.fixtureId, attribute, 0) : 0) }, 0) / selectedBeams.length) :
    selectedFixtures.length > 0
      ? Math.round(
          selectedFixtures.reduce(
            // The undefined fallback for a property: 255 for a dimmer
            // fixture's RGB (it shows white); 0 otherwise — a fixture
            // with a dimmer channel starts dark, and a virtual dimmer
            // (a fixture with colour channels but no dimmer channel)
            // reads 0 until its dimmer is set (Jake, 19 Nov 2026,
            // reversing Piece 13's full-open default).
            (total, fixture) => total + fixtureAttr(fixture.id, attribute, fixture.type === 'dimmer' && ['red', 'green', 'blue'].includes(attribute) ? 255 : 0),
            0
          ) / selectedFixtures.length
        )
      : 0
  // The dimmer reads the effective intensity — the cue or preset value,
  // else the fixture's default (0 for a dimmer channel and for a virtual
  // dimmer — a fresh fixture is dark; Jake, 19 Nov 2026, reversing
  // Piece 13). With no cue at all the defaults still apply, so a fresh
  // fixture reads 0 here and is dark in the output.
  const dimmer = valueFor('intensity')
  // The wheel drives every beam of a multipart fixture, so it reads the
  // linked colour: the average of an attribute across the fixture's
  // beams (each beam's channels via its beam properties), then averaged
  // across the selected fixtures. A beam separated by its own sliders
  // shows as the average until the wheel moves and re-links them. With
  // individual beams selected the wheel already reads those beams
  // (valueFor), and a single-cell fixture reads as before — including
  // valueFor's undefined fallbacks (255 for a dimmer fixture's RGB,
  // 0 otherwise).
  const linkedValueFor = (attribute: string) => {
    if (selectedBeams.length || !selectedFixtures.length) return valueFor(attribute)
    return Math.round(selectedFixtures.reduce((total, fixture) => {
      const keys = fixtureBeams(fixture).map((beam) => beam.properties[attribute]).filter((key): key is string => Boolean(key))
      if (!keys.length) return total + fixtureAttr(fixture.id, attribute, fixture.type === 'dimmer' && ['red', 'green', 'blue'].includes(attribute) ? 255 : 0)
      return total + keys.reduce((sum, key) => sum + fixtureAttr(fixture.id, key, 0), 0) / keys.length
    }, 0) / selectedFixtures.length)
  }
  // A Design write defines the property for the fixture (Guide ch.8,
  // p.80) — it becomes a manual override — except while a preset or a
  // cue's ad-hoc layer is being edited, when it writes into that stored
  // layer instead. This is also what stops Design writes minting cues.
  const writeManual = !editingPreset && !editingCueAdHocId
  const updateValues = editingPreset ? updateEditingPresetValues
    : selectedBeams.length ? (values: Record<string, number>) => updateSelectedBeamValues(values, writeManual) : (values: Record<string, number>) => updateSelectedFixtures(values, writeManual)
  // The wheel's hue / saturation / brightness describe the base colour
  // (the RGB or CMY mix) only. White / Amber / UV are separate LEDs
  // (Guide p.85) with their own sliders beside the wheel — they change
  // the light the fixture actually makes, which the centre disc shows
  // (colorValues, the mixed colour), but they must not move the wheel's
  // own arcs: the fixture's RGB channels do not change when White or
  // Amber moves. (Jake, 19 Nov 2026: raising White was desaturating the
  // wheel and Amber was shifting its hue, because the wheel HSV was
  // derived from the mix.) The reverse is true on the write side too:
  // a wheel drag must not write White / Amber — deriving them from the
  // RGB made the arcs move each other (saturation down stole brightness
  // into White, hue to yellow drove Amber), so the wheel writes through
  // setWheelColor, which touches the base colour only.
  const baseColorValues = {
    red: commonAttributes.includes('cyan') ? 255 - linkedValueFor('cyan') : linkedValueFor('red'),
    green: commonAttributes.includes('magenta') ? 255 - linkedValueFor('magenta') : linkedValueFor('green'),
    blue: commonAttributes.includes('yellow') ? 255 - linkedValueFor('yellow') : linkedValueFor('blue')
  }
  const colorValues = {
    red: commonAttributes.includes('cyan') ? 255 - linkedValueFor('cyan') : Math.min(255, linkedValueFor('red') + linkedValueFor('white') + linkedValueFor('amber')),
    green: commonAttributes.includes('magenta') ? 255 - linkedValueFor('magenta') : Math.min(255, linkedValueFor('green') + linkedValueFor('white') + linkedValueFor('amber') * 0.45),
    blue: commonAttributes.includes('yellow') ? 255 - linkedValueFor('yellow') : Math.min(255, linkedValueFor('blue') + linkedValueFor('white'))
  }
  const colorSupported = previewOnlyColor || ['cyan', 'magenta', 'yellow'].every((a) => commonAttributes.includes(a)) || ['red', 'green', 'blue'].every((attribute) =>
    commonAttributes.includes(attribute)
  )
  // The virtual dimmer (Piece 12): colour fixtures without a dimmer
  // channel still get a working Dimmer fader.
  const virtualDimmerSupported = !dimmerSupported && colorSupported
  const dimmerAvailable = dimmerSupported || virtualDimmerSupported
  const rawHsv = rgbToHsv(baseColorValues)
  // Hue, saturation and brightness are independent of each other
  // (Jake, 19 Nov 2026): the fixture's RGB cannot hold a hue at
  // brightness 0 (black) or saturation 0 (grey), so the wheel's own
  // last-chosen HSV is kept in state and shown while the colour is
  // degenerate — dragging the hue ring at brightness 0 moves the marker
  // and sticks, and bringing the brightness back up shows the chosen
  // hue. Saturation and brightness default to 100% for a degenerate
  // colour, so the wheel works immediately with a vivid colour instead
  // of starting dead at 0. See displayHsv.
  const [preservedHsv, setPreservedHsv] = useState(() => ({ h: rawHsv.h, s: rawHsv.s > 0 ? rawHsv.s : 100, v: rawHsv.v > 0 ? rawHsv.v : 100 }))
  // The colour card's header (LightKey, Jake's screenshots 19 Nov
  // 2026): the last-adjusted colour property — the wheel's hue ring /
  // arcs, or one of the additional-colour sliders beside it. It
  // persists after the drag ends until another colour property is
  // adjusted, and resets when the selection or cue changes, so it can
  // never show a stale value for a different fixture or cue.
  const [activeColorProperty, setActiveColorProperty] = useState<ActiveColorProperty | null>(null)
  // The selected control (see SelectedDesignControl above): which
  // control carries the blue border. It is set by clicking a control
  // or tabbing into one (onFocus), and cleared by clicking spare
  // space — so the bordered control is always the one the arrow keys
  // act on. The arrow keys themselves stay focus-driven (FillFader's
  // and the wheel's own key handlers); selection and focus are kept
  // in step instead of a second key path: a spare-space click blurs
  // the focused control as it clears the selection, so with nothing
  // bordered the keys adjust nothing.
  const [selectedControl, setSelectedControl] = useState<SelectedDesignControl | null>(null)
  const inspectorRef = useRef<HTMLDivElement>(null)
  const clearSelection = () => {
    setSelectedControl(null)
    // Move focus out of the control too, so its arrow keys stop
    // adjusting it — but only if focus is inside this panel; a click
    // here must never blur a control the user is using elsewhere.
    const active = document.activeElement as HTMLElement | null
    if (active && inspectorRef.current?.contains(active)) active.blur()
  }
  const selectionKey = `${selectedFixtureIds.join(',')}|${activeCueId ?? ''}|${editingPresetId ?? ''}`
  useEffect(() => {
    const raw = rgbToHsv(baseColorValues)
    if (raw.s > 0 && raw.v > 0) setPreservedHsv({ h: raw.h, s: raw.s, v: raw.v })
    else if (raw.v > 0) setPreservedHsv((prev) => ({ ...prev, s: raw.s, v: raw.v }))
    // Black: there is no real saturation or brightness to show, so the
    // wheel starts at 100/100 (see above) instead of 0/0. The hue is
    // kept from whatever the wheel last chose.
    else setPreservedHsv((prev) => ({ ...prev, s: 100, v: 100 }))
    setActiveColorProperty(null)
    // The program list belongs to this selection and cue; a new one
    // starts closed.
    setProgramListOpen(false)
    // With no fixtures selected the controls are gone, so a selection
    // pointing at one of them is dropped too. Switching fixtures or
    // cues keeps the selection: the control (Dimmer, Colour, a fader)
    // is the same control, only its fixture changed.
    if (selectedFixtureIds.length === 0) setSelectedControl(null)
    // Sync only when the selection or cue changes — the wheel's own
    // drags update the preserved HSV through onHsvChange below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])
  const hsv = displayHsv(rawHsv, preservedHsv)
  // The colour card header's text, derived live from the current
  // values — so the value stays correct after the drag ends and if
  // another path changes the same property. Idle (nothing adjusted
  // yet): "Color" with no value, as in Jake's fourth LightKey
  // screenshot; a dimmer fixture keeps its "Preview colour" idle
  // label. Hue is degrees ("67°"); saturation / brightness / the
  // additional sliders are percents with "Off" at 0 and "Full" at 100.
  const colorHeaderLabel = activeColorProperty
    ? colorPropertyHeaderName(activeColorProperty)
    : previewOnlyColor ? 'Preview colour' : 'Color'
  const colorHeaderValue = activeColorProperty === 'hue' ? `${Math.round(hsv.h)}°`
    : activeColorProperty === 'saturation' ? percentHeaderText(hsv.s)
    : activeColorProperty === 'brightness' ? percentHeaderText(hsv.v)
    : activeColorProperty ? percentHeaderText((linkedValueFor(activeColorProperty) / 255) * 100)
    : null
  const additionalColourAttributes = commonAttributes.filter((a) => ADDITIONAL_COLOUR_ATTRIBUTES.includes(a))
  // "Reset Default" only belongs on the Colour menu once a fixture has a
  // custom default colour stored; "Load Default" is always offered (with
  // no custom default it loads the built-in blue).
  const hasCustomColorDefault = selectedFixtures.some((fixture) =>
    colorChannels(fixtureAttributes(fixture)).some((attribute) => fixture.defaultValues?.[attribute] !== undefined)
  )
  // Shutter/Strobe + Auto Program cards (LightKey, Jake's screenshot 19
  // Nov 2026 — see lib/shutterStrobe.ts and lib/autoProgram.ts for the
  // guide references). The shutter channel is the fixture's
  // shutter/strobe channel with mappable ranges; the program channel is
  // its built-in-program channel, with its speed channel when it has
  // one. A channel with no mappable ranges (a slot-less raw byte, like
  // the built-in moving head's strobe) has no card and stays a fader.
  // Defined here, before faderAttributes, because the card channels are
  // excluded from the fader row below.
  const shutter = findShutterChannel(availableProperties(selectedFixtures))
  const shutterChannel = shutter?.channel
  const autoProgram = findAutoProgram(availableProperties(selectedFixtures))
  const cardAttributes = new Set([
    ...(shutter ? [shutterChannel!.attribute] : []),
    ...(autoProgram ? [autoProgram.programChannel.attribute, ...(autoProgram.speedChannel ? [autoProgram.speedChannel.attribute] : [])] : [])
  ])
  const faderAttributes = colorSupported
    ? channelAttributes.filter((attribute) => !COLOUR_FADER_ATTRIBUTES.includes(attribute) && !cardAttributes.has(attribute))
    : channelAttributes.filter((attribute) => !cardAttributes.has(attribute))
  const channelByAttribute = new Map(availableProperties(selectedFixtures).map((c) => [c.attribute, c]))

  // Beam 1's own RGB sliders (Jake, 20 Nov 2026): the linked wheel drives
  // every beam, and beams 2–4 already have per-beam sliders — their
  // `red2`/`red3`/`red4` keys survive the wheel's fan-out — but beam 1's
  // bare `red`/`green`/`blue` are the wheel's own keys, so beam 1 had no
  // way to be set on its own: using the wheel for beam 1 re-drove all
  // the others. On a multipart fixture beam 1 gets its own sliders too,
  // reading and writing only its first cell through the beam path (never
  // the fanning whole-fixture write). A single-beam fixture is unchanged:
  // the wheel already is its beam 1. CMY fixtures get Cyan 1 / Magenta 1
  // / Yellow 1 the same way.
  const isMultipart = selectedFixtures.length > 0 && selectedFixtures.every((fixture) => fixtureBeams(fixture).length >= 2)
  const beam1IsCmy = isMultipart && selectedFixtures.every((fixture) => 'cyan' in (fixtureBeams(fixture)[0]?.properties ?? {}))
  const beam1Attributes = isMultipart
    ? (beam1IsCmy ? ['cyan', 'magenta', 'yellow'] : ['red', 'green', 'blue']).filter((attribute) => selectedFixtures.every((fixture) => { const properties = fixtureBeams(fixture)[0]?.properties; return properties && attribute in properties }))
    : []
  // Beam 1's channel for an attribute, read across the selection (the
  // bare key is beam 1's channel — `red`, not `red2`).
  const beam1ValueFor = (attribute: string) => selectedFixtures.length > 0
    ? Math.round(selectedFixtures.reduce((total, fixture) => { const key = fixtureBeams(fixture)[0]?.properties[attribute]; return total + (key ? fixtureAttr(fixture.id, key, 0) : 0) }, 0) / selectedFixtures.length)
    : 0
  const writeBeam1 = (attribute: string, next: number) => {
    if (editingPreset) {
      updateEditingPresetValues({ [attribute]: next }, selectedFixtures.map((fixture) => ({ fixtureId: fixture.id, beamId: fixtureBeams(fixture)[0].id })))
      return
    }
    for (const fixture of selectedFixtures) updateBeamValues(fixture.id, fixtureBeams(fixture)[0].id, { [attribute]: next }, writeManual)
  }

  // The cue/preset value with no fixture-default fallback: an unset
  // property is undefined, not the channel default. The Auto Program
  // card reads through here so an undefined program shows "No Selection"
  // (a raw fixtureAttr would read the channel default and an R3 Spot
  // would otherwise read as "Auto program 1" because its first range
  // starts at 0). A defined (overridden) property still reads first,
  // like fixtureAttr.
  const rawAttr = (fixtureId: string, attribute: string) =>
    editingPreset?.fixtureValues[fixtureId]?.[attribute] ?? (editingPreset ? undefined : manualOverrides[fixtureId]?.[attribute]) ?? cueValues[fixtureId]?.[attribute]
  // The shutter state is unanimous across the selection or mixed —
  // averaging raw DMX values across fixtures would land in the wrong
  // slot, so each fixture's state is read and they must agree.
  const shutterReadings = shutter && shutterChannel
    ? selectedFixtures.map((fixture) => shutterStateForValue(shutter, fixtureAttr(fixture.id, shutterChannel.attribute, 0)))
    : []
  const shutterState: ShutterState | 'mixed' = shutterReadings.length && shutterReadings.every((r) => r.state === shutterReadings[0].state)
    ? shutterReadings[0].state
    : 'mixed'
  // The speed position while strobing/pulsing, from the first fixture's
  // value inside the active mode's range (LightKey: drag on the
  // Strobe/Pulse button, Guide p.98).
  const shutterSpeed = shutter && shutterChannel && (shutterState === 'strobe' || shutterState === 'pulse')
    ? shutterSpeedForValue(shutter, fixtureAttr(selectedFixtures[0].id, shutterChannel.attribute, 0))
    : undefined
  // The program selection is unanimous across the selection or mixed —
  // same reason as the shutter: slot membership, not an average.
  const programSlotsSelected = autoProgram
    ? selectedFixtures.map((fixture) => {
        const value = rawAttr(fixture.id, autoProgram.programChannel.attribute)
        return value === undefined ? undefined : programSlotForValue(autoProgram, value)
      })
    : []
  const programMixed = programSlotsSelected.some((slot) => slot?.id !== programSlotsSelected[0]?.id)
  const programSlot = programMixed ? undefined : programSlotsSelected[0]
  const speedRange = autoProgram ? programSpeedRange(autoProgram) : undefined

  const writeShutter = (value: number | undefined) => {
    if (value !== undefined && shutterChannel) updateValues({ [shutterChannel.attribute]: value })
  }
  // Re-clicking Strobe / Pulse advances to the next mode the fixture
  // supports (Guide p.98: Strobe, Synchronised, Random, Random
  // synchronised, Lightning; Pulse opening, closing, alternating,
  // burst, random variants). The speed position carries across, so the
  // rate does not jump when the mode changes.
  const cycleShutterEffect = (kind: 'strobe' | 'pulse') => {
    if (!shutter || !shutterChannel) return
    const slots = kind === 'strobe' ? shutter.strobeSlots : shutter.pulseSlots
    if (!slots.length) return
    const current = shutterStateForValue(shutter, fixtureAttr(selectedFixtures[0].id, shutterChannel.attribute, 0))
    const currentIndex = current.slot ? slots.findIndex((slot) => slot.id === current.slot!.id) : -1
    const nextIndex = current.state === kind && currentIndex >= 0 ? (currentIndex + 1) % slots.length : 0
    writeShutter(shutterValueForState(shutter, kind, { modeIndex: nextIndex, speed: shutterSpeed?.position ?? 0.5 }))
  }
  const setShutterSpeed = (position: number) => {
    if (!shutterSpeed) return
    writeShutter(valueAtSpeed(shutterSpeed.slot, position))
  }
  // The shutter card's keys (Guide pp.97–98: O open, C close, S cycle
  // strobe, P cycle pulse). Card-local only — the keys act when the
  // card has focus, so they never fight the app-wide shortcuts. The
  // speed fader keeps its own arrow keys (FillFader), so this handler
  // takes no arrow keys: a press on the fader would otherwise step
  // the speed twice.
  const onShutterKeyDown = (event: React.KeyboardEvent) => {
    if (!shutter) return
    const key = event.key.toLowerCase()
    if (key === 'o' || key === 'c' || key === 's' || key === 'p') {
      event.preventDefault()
      event.stopPropagation()
      if (key === 'o') writeShutter(shutterValueForState(shutter, 'open'))
      else if (key === 'c') writeShutter(shutterValueForState(shutter, 'closed'))
      else if (key === 's') cycleShutterEffect('strobe')
      else cycleShutterEffect('pulse')
    }
  }

  // The Auto Program option list (Guide pp.110–111): click the
  // property's button, the list appears, click an option. Options are
  // the program channel's ranges except the no-function range, which
  // "No Selection" writes; each option writes its range's midpoint,
  // the established wheelSlotValue path.
  const programOptions = autoProgram
    ? [
        { id: '__none', name: 'No Selection', value: autoProgram.noFunctionSlot ? wheelSlotValue(autoProgram.programChannel, autoProgram.noFunctionSlot.id) : 0 },
        ...autoProgram.programSlots.map((slot) => ({ id: slot.id, name: slot.name, value: wheelSlotValue(autoProgram.programChannel, slot.id) }))
      ]
    : []
  const [programListOpen, setProgramListOpen] = useState(false)
  const [programActiveId, setProgramActiveId] = useState<string | null>(null)
  const programCardRef = useRef<HTMLDivElement>(null)
  const selectProgramOption = (option: { id: string; value: number }) => {
    if (!autoProgram) return
    updateValues({ [autoProgram.programChannel.attribute]: option.value })
    setProgramListOpen(false)
  }
  const onProgramButtonKeyDown = (event: React.KeyboardEvent) => {
    if (!autoProgram) return
    const options = programOptions
    const activeIndex = Math.max(0, options.findIndex((option) => option.id === programActiveId))
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!programListOpen) {
        setProgramListOpen(true)
        setProgramActiveId(programSlot?.id ?? '__none')
      } else if (event.key === 'ArrowDown') {
        setProgramActiveId(options[Math.min(options.length - 1, activeIndex + 1)]?.id ?? null)
      } else {
        const option = options[activeIndex]
        if (option) selectProgramOption(option)
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (programListOpen) setProgramActiveId(options[Math.max(0, activeIndex - 1)]?.id ?? null)
    } else if (event.key === 'Escape') {
      setProgramListOpen(false)
    } else if (event.key.length === 1) {
      // Type-ahead: the first letters of an option's name (Guide p.111).
      const match = options.find((option) => option.name.toLowerCase().startsWith(event.key.toLowerCase()))
      if (match) {
        setProgramListOpen(true)
        setProgramActiveId(match.id)
      }
    }
  }
  // Close the program list on a pointerdown outside the card.
  useEffect(() => {
    if (!programListOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (programCardRef.current && !programCardRef.current.contains(event.target as Node)) setProgramListOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [programListOpen])

  const setColor = (hex: string) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return
    if (editingPreset) updateEditingPresetValues({ ...rgb })
    else if (selectedBeams.length) updateSelectedBeamValues({ ...rgb }, writeManual)
    else setSelectedColor(rgb, writeManual)
  }

  // The wheel's own write path: hue / saturation / brightness set the
  // base colour only (see setSelectedBaseColor) — White / Amber / UV
  // stay exactly where their sliders left them. The centre picker
  // still uses setColor above: applying a whole colour may use the
  // extra emitters to reproduce it.
  const setWheelColor = (hex: string) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return
    if (editingPreset) updateEditingPresetValues({ ...rgb })
    else if (selectedBeams.length) updateSelectedBeamValues({ ...rgb }, writeManual)
    else setSelectedBaseColor(rgb, writeManual)
  }

  // Per-property fanning (LightKey Guide §8, p.118–123): each property's
  // own control carries the entry point — the property name's menu,
  // "Add (property name) Fanning…" — and when a property is fanned its
  // area shows an icon instead of the normal controls. A fan lives in
  // the session's manual fans — unless a cue's ad-hoc layer is being
  // edited, when it lives on that cue. Fanning is hidden while editing
  // a preset (fans are cue-level). With beams selected the fan opens
  // across those beams (Guide p.119) — see StagePreview openFanHud.
  const fans = [...manualFans, ...(activeCue?.fans ?? []).filter((f) => !manualFans.some((m) => m.id === f.id))]
  const fanFor = (attribute: string) => fans.find((f) => f.attribute === attribute && f.fixtureIds.some((id) => selectedFixtureIds.includes(id)))
  const deleteFanKeep = (fan: FanDef | undefined) => { if (fan) deleteFan(fan.id, true) }
  const showFanButtons = !editingPreset
  const dimmerFan = fanFor('intensity')
  const colorFan = fanFor('color')
  const panFan = fanFor('pan')
  const tiltFan = fanFor('tilt')
  const positionFan = panFan ?? tiltFan
  // The Auto Program Speed slider fans like any other slider property
  // (Guide §8, p.118); the program list itself does not (only slider
  // properties fan), and neither does Shutter/Strobe.
  const speedFan = autoProgram?.speedChannel ? fanFor(autoProgram.speedChannel.attribute) : undefined
  // The speed fader's 0–255 position inside the speed range (an options
  // speed channel spans only its EffectSpeed range, not the whole
  // channel — see lib/autoProgram.ts). The readout is the percent of
  // that range: LightKey's speed is 0–1 (Guide p.314), and no
  // per-fixture Hz mapping exists in the OFL data to show Hertz.
  const speedFaderValue = autoProgram?.speedChannel && speedRange && speedRange.max > speedRange.min
    ? Math.round(((valueFor(autoProgram.speedChannel.attribute) - speedRange.min) / (speedRange.max - speedRange.min)) * 255)
    : 0

  // The visual effect editor and the effects chooser (Guide ch.10) take
  // over the bottom panel — the settings sit below the Preview — while
  // one is open. Closing either returns to the normal Design controls.
  if (editingEffectId) {
    return (
      <div className="design-fixture-inspector flex h-full min-h-0 flex-col gap-2 overflow-hidden">
        <EffectEditor effectTabHost={effectTabHost} effectToolsHost={effectToolsHost} movementChartHost={movementChartHost} />
      </div>
    )
  }
  if (effectChooserAttribute) {
    return (
      <div className="design-fixture-inspector flex h-full min-h-0 flex-col gap-2 overflow-hidden">
        <EffectsChooser chooserLeftHost={chooserLeftHost} chooserSearchHost={chooserSearchHost} />
      </div>
    )
  }
  return (
    <div
      ref={inspectorRef}
      className="design-fixture-inspector flex h-full min-h-0 flex-col gap-2 overflow-hidden"
      // Spare-space click (Jake, 19 Nov 2026): a pointerdown landing on
      // empty space in the panel clears the control selection. Control
      // clicks never reach here — each control's wrapper stops
      // propagation on pointerdown — so this only fires for spare
      // space. The Position control is not a selectable control: clicking
      // it clears the selection like spare space.
      onPointerDown={clearSelection}
    >
      {/* Selection header and cue-contents strip removed 19 Nov 2026
          (Jake): the "N fixtures selected" title, the "Contents: Ad hoc"
          line with its preset/sequence chips and the "+ Preset…" /
          "+ Sequence…" dropdowns wasted screen space. The cue-reference
          model is untouched (resolveCueValues still applies a cue's
          presetIds/sequenceIds) — but there is now no UI anywhere to add
          a preset/sequence to a cue, remove one, or see what a cue
          contains; see NOTES.md. */}
      {/* The row carries 4px of left padding (Jake, 20 Nov 2026): the
          Dimmer column sits first, flush against the left edge of this
          overflow-hidden panel, and a selected fader's outset blue
          outline extends 2px past the track on every side — without
          this padding the outline's whole left segment was clipped off
          by the panel edge while the other three sides rendered. The
          4px leaves the ring 2px clear of the edge. */}
      <div className="flex min-h-0 flex-1 items-stretch gap-3 pl-1">
        {/* Dimmer: the shared FillFader — the same LightKey-style solid
            fill bar as the Master fader (lavender fill), not a thin line
            with a round knob. Clicking (or tabbing into) the column
            selects the Dimmer — the blue border — and the pointerdown
            stops here so the panel's spare-space clear never fires for
            a control click. */}
        <div
          className="flex w-16 shrink-0 flex-col items-center gap-0.5"
          onPointerDown={(event) => { event.stopPropagation(); setSelectedControl('dimmer') }}
          onFocus={() => setSelectedControl('dimmer')}
        >
          <span className="flex items-center gap-1 text-[11px] font-medium uppercase text-dim">
            {dimmerFan && <FanDeleteDot label="Dimmer" onDelete={() => deleteFanKeep(dimmerFan)} />}
            Dimmer
            <button type="button" className="normal-case text-dim hover:text-white" title="Add Dimmer Effect…" aria-label="Add Dimmer Effect…" disabled={!canEdit} onClick={(event) => { event.stopPropagation(); openEffectFor('intensity') }}>∿</button>
            {showFanButtons && !dimmerFan && dimmerAvailable && (
              <FanMenuButton label="Dimmer" items={[{ label: 'Add Dimmer Fanning…', onSelect: () => dispatchFanHud({ attribute: 'intensity' }) }]} disabled={!canEdit} />
            )}
          </span>
          {dimmerEffect ? (
            <EffectIndicator effect={dimmerEffect} onEdit={() => setEditingEffectId(dimmerEffect.id)} />
          ) : dimmerFan ? (
            <div className="flex w-full flex-1 items-stretch">
              <FannedIcon label="Dimmer" onEdit={() => dispatchFanHud({ attribute: 'intensity' })} />
            </div>
          ) : (
            <>
              <FillFader
                value={dimmer}
                onChange={(next) => {
                  // Guide p.98: LightKey automatically opens the shutter
                  // when a non-zero Dimmer is applied while the shutter
                  // was closed. Design-tab Dimmer only — the Live faders
                  // write through their own path; see NOTES.md.
                  if (next > 0 && shutter && shutterState === 'closed') {
                    const open = shutterValueForState(shutter, 'open')
                    if (open !== undefined && shutterChannel) {
                      updateValues({ intensity: next, [shutterChannel.attribute]: open })
                      return
                    }
                  }
                  updateValues({ intensity: next })
                }}
                label="Dimmer for selected fixtures"
                fillColor="#d9d4f5"
                disabled={!canEdit || !dimmerAvailable}
                trackClassName="design-fill-track"
                selected={selectedControl === 'dimmer'}
              />
              <span className="font-mono text-[12px] text-white">
                {dimmerAvailable ? `${Math.round((dimmer / 255) * 100)}%` : '—'}
              </span>
            </>
          )}
        </div>

        {/* Colour card (LightKey, Jake's screenshots 19 Nov 2026): the
            round control sits in a card with a header — the active
            property top-left, its value top-right — and the wheel +
            additional-colour sliders below it. The card fills the panel
            height: the wheel grows with it (a square box stretched to
            the card body, not the old fixed 150px that left spare space
            below it), the additional sliders stretch with it, and the
            Dimmer fader stretches the same way — so the Dimmer and the
            colour card take up most of the panel's vertical height
            (Jake, 19 Nov 2026). The centre disc opens the system colour
            window. The per-channel colour faders are gone: the wheel +
            its sliders are the colour control. */}
        <div className="flex min-h-0 shrink-0 flex-col items-stretch gap-0.5">
          <div
            data-testid="colour-card"
            className={`flex min-h-0 flex-1 flex-col rounded-lg border-2 bg-panel2 p-2 ${selectedControl === 'colour' ? 'border-[#0A84FF]' : 'border-line'}`}
            // Clicking (or tabbing into) the card selects the wheel —
            // the blue border — and stops here, so the panel's
            // spare-space clear never fires for it. The additional
            // sliders inside the card have their own handlers and stop
            // propagation first, so clicking one selects that slider,
            // not the wheel.
            onPointerDown={(event) => { event.stopPropagation(); setSelectedControl('colour') }}
            onFocus={(event) => { event.stopPropagation(); setSelectedControl('colour') }}
          >
            <div data-testid="colour-card-header" className="flex flex-none items-center justify-between gap-2 pb-1">
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-white">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: '#0A84FF' }} />
                {colorFan && <FanDeleteDot label="Colour" onDelete={() => deleteFanKeep(colorFan)} />}
                <span className="truncate">{colorHeaderLabel}</span>
                <button type="button" className="shrink-0 text-dim hover:text-white" title="Add Color Effect…" aria-label="Add Color Effect…" disabled={!canEdit} onClick={(event) => { event.stopPropagation(); openEffectFor('color') }}>∿</button>
                {showFanButtons && !colorFan && colorSupported && (
                  <FanMenuButton label="Colour" title="Colour options" items={[
                    { label: 'Add Colour Fanning…', onSelect: () => dispatchFanHud({ attribute: 'color' }) },
                    { label: 'Set as Default', onSelect: () => setColorDefault() },
                    { label: 'Load Default', onSelect: () => { setActiveColorProperty(null); loadColorDefault() } },
                    ...(hasCustomColorDefault ? [{ label: 'Reset Default', onSelect: () => resetColorDefault() }] : []),
                  ]} disabled={!canEdit} />
                )}
              </span>
              {colorHeaderValue !== null && (
                <span data-testid="colour-card-header-value" className="shrink-0 text-[13px] text-white">{colorHeaderValue}</span>
              )}
            </div>
          {colorEffect ? (
            <EffectIndicator effect={colorEffect} onEdit={() => setEditingEffectId(colorEffect.id)} />
          ) : colorFan ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <FannedIcon label="Colour" onEdit={() => dispatchFanHud({ attribute: 'color' })} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-stretch gap-1">
              {/* Square, height-stretched: the wheel grows with the card
                  body (aspect-square off the stretched height) instead
                  of the old fixed 150px. */}
              <div className="flex aspect-square min-h-0 min-w-0 flex-none self-stretch">
                <ColorWheelControl
                  hsv={hsv}
                  centreHex={colorHex(colorValues)}
                  disabled={!canEdit || !colorSupported}
                  onHsvChange={(next) => { setPreservedHsv({ h: next.h, s: next.s, v: next.v }); setWheelColor(rgbToHex(hsvToRgb(next.h, next.s, next.v))) }}
                  onCentrePick={(hex) => {
                    const picked = hexToRgb(hex)
                    if (picked) { const p = rgbToHsv({ red: picked.red, green: picked.green, blue: picked.blue }); if (p.s > 0 && p.v > 0) setPreservedHsv({ h: p.h, s: p.s, v: p.v }) }
                    // A whole-colour pick is a "Color" change — back to
                    // the idle header, not the last-dragged segment.
                    setActiveColorProperty(null)
                    setColor(hex)
                  }}
                  onActiveZoneChange={(zone) => setActiveColorProperty(zone)}
                />
              </div>
              {/* Additional-colour sliders beside the wheel — the same
                  shared FillFader as the channel faders, one per
                  additional colour channel the selected fixtures
                  actually have, wired through updateValues (the same
                  write path the inner arcs used). A fixture without
                  White / Amber / UV / lime shows no sliders. Each slider
                  fans like any other slider property (Guide §8, p.118);
                  while the Colour fan is active the whole colour block
                  — wheel and sliders — is replaced by the FannedIcon,
                  as the arcs were before. The sliders are disabled only
                  by canEdit, not by colorSupported, so a white-only
                  fixture still gets a working White slider when the
                  wheel itself does not apply. The sliders sit in a 2×2
                  grid in LightKey's slots (White top-left, UV
                  top-right, Amber bottom-left, Lime bottom-right) and
                  each FillFader carries its value gradient (white,
                  UV blue-violet, amber gold, lime green — full colour
                  at the top, black at the bottom, sampled from Jake's
                  LightKey screenshots); a fixture with fewer than four
                  keeps its empty slot(s) instead of collapsing the
                  grid, as LightKey does for White/Amber/UV. */}
              {additionalColourAttributes.length > 0 && (
                <div data-testid="additional-colour-grid" className="additional-colour-grid">
                  {additionalColourSlots(additionalColourAttributes).map((slot, index) => {
                    if (slot === null) {
                      // Empty slot (LightKey): a blank cell the size of
                      // a slider column — no label, no slider, nothing
                      // to click — so the grid keeps its 2×2 shape.
                      return <div key={`empty-${index}`} data-testid="additional-colour-empty-slot" aria-hidden="true" className="additional-colour-empty-slot" />
                    }
                    const attribute = slot
                    // The linked read (Jake, 19 Nov 2026): the slider shows
                    // the average White / Amber / UV / Lime across the
                    // fixture's beams, like the wheel's own read — beam 1
                    // alone would lie as soon as a beam separates. The
                    // write below goes through updateValues, whose store
                    // paths fan the value out to every beam.
                    const value = linkedValueFor(attribute)
                    const fan = fanFor(attribute)
                    return (
                      <div
                        key={attribute}
                        className="chan"
                        // Its own control: clicking (or tabbing into) a
                        // slider selects that slider, not the wheel — and
                        // stops here, so the card's own select never fires
                        // for it.
                        onPointerDown={(event) => { event.stopPropagation(); setSelectedControl(`slider:${attribute}`) }}
                        onFocus={(event) => { event.stopPropagation(); setSelectedControl(`slider:${attribute}`) }}
                      >
                        <span className="flex items-center justify-center gap-0.5 text-[10px] leading-none text-dim">
                          {fan && <FanDeleteDot label={attributeLabel(attribute)} onDelete={() => deleteFanKeep(fan)} />}
                          {attributeLabel(attribute)}
                          {showFanButtons && !fan && (
                            <FanMenuButton label={attributeLabel(attribute)} items={[{ label: `Add ${attributeLabel(attribute)} Fanning…`, onSelect: () => dispatchFanHud({ attribute }) }]} disabled={!canEdit} />
                          )}
                        </span>
                        {fan ? (
                          <FannedIcon label={attributeLabel(attribute)} onEdit={() => dispatchFanHud({ attribute })} />
                        ) : (
                          <>
                            <FillFader
                              value={value}
                              onChange={(next) => {
                                // Moving a slider switches the card header
                                // to that property (LightKey).
                                if (attribute === 'white' || attribute === 'amber' || attribute === 'uv' || attribute === 'lime') setActiveColorProperty(attribute)
                                updateValues({ [attribute]: next })
                              }}
                              label={`${attributeLabel(attribute)} for selected fixtures`}
                              fillColor={channelFillColor(attribute)}
                              fillGradient={additionalColourFillGradient(attribute) ?? undefined}
                              disabled={!canEdit}
                              trackClassName="design-fill-track"
                              selected={selectedControl === `slider:${attribute}`}
                            />
                            <span className="text-center font-mono text-[11px] leading-none text-zinc-400">
                              {value}
                            </span>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          </div>
          {/* No numeric RGB readout under the wheel (Jake, 19 Nov 2026):
              the green channel printed a raw float (9.450000000000001,
              from amber × 0.45 in colorValues) and the long value broke
              the panel layout. The wheel + marker show the colour; the
              only other readouts in this panel are already integers —
              Dimmer % (Math.round), Pan/Tilt and channel values
              (valueFor, which rounds). */}
        </div>

        {/* Shutter/Strobe card (LightKey Guide pp.97–98; Jake's
            screenshot 19 Nov 2026): Open / Closed radios, Strobe and
            Pulse buttons that cycle the fixture's strobe modes / pulse
            styles — only the ones its profile supports — and a speed
            fader while an effect is active. The channel's ranges are
            the state (see lib/shutterStrobe.ts), so Strobe writes a
            value inside a ShutterStrobe range and the fixture itself
            strobes. No fan button: Shutter is not in the guide's
            fanning list (§8, p.118). */}
        {shutter && shutterChannel && (
          <div className="flex min-h-0 shrink-0 flex-col items-stretch gap-0.5">
            <div
              data-testid="shutter-strobe-card"
              className={`flex min-h-0 w-48 flex-1 flex-col rounded-lg border-2 bg-panel2 p-2 ${selectedControl === 'shutter' ? 'border-[#0A84FF]' : 'border-line'}`}
              // Its own control: clicking (or tabbing into) the card
              // selects the shutter — the blue border — and stops here,
              // so the panel's spare-space clear never fires for it.
              onPointerDown={(event) => { event.stopPropagation(); setSelectedControl('shutter') }}
              onFocus={() => setSelectedControl('shutter')}
              onKeyDown={onShutterKeyDown}
            >
              <div className="flex flex-none items-center gap-2 pb-1">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: '#0A84FF' }} />
                <span className="text-[13px] text-white">Shutter/Strobe</span>
              </div>
              <div className="flex flex-none items-center gap-4 px-1 py-1" role="radiogroup" aria-label="Shutter">
                <button
                  type="button"
                  role="radio"
                  aria-checked={shutterState === 'open'}
                  disabled={!canEdit}
                  onClick={() => writeShutter(shutterValueForState(shutter, 'open'))}
                  className="flex items-center gap-1.5 text-[13px] text-white disabled:opacity-40"
                >
                  <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border ${shutterState === 'open' ? 'border-[#0A84FF]' : 'border-zinc-400'}`}>
                    {shutterState === 'open' && <span className="h-2.5 w-2.5 rounded-full bg-[#0A84FF]" />}
                  </span>
                  Open
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={shutterState === 'closed'}
                  disabled={!canEdit || !shutter.closedSlot}
                  title={shutter.closedSlot ? undefined : 'This fixture has no closed shutter range'}
                  onClick={() => writeShutter(shutterValueForState(shutter, 'closed'))}
                  className="flex items-center gap-1.5 text-[13px] text-white disabled:opacity-40"
                >
                  <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border ${shutterState === 'closed' ? 'border-[#0A84FF]' : 'border-zinc-400'}`}>
                    {shutterState === 'closed' && <span className="h-2.5 w-2.5 rounded-full bg-[#0A84FF]" />}
                  </span>
                  Closed
                </button>
              </div>
              <div className="flex flex-none items-center gap-2 px-1 py-1">
                <button
                  type="button"
                  aria-pressed={shutterState === 'strobe'}
                  disabled={!canEdit || shutter.strobeSlots.length === 0}
                  title={shutter.strobeSlots.length ? undefined : 'This fixture has no strobe range'}
                  onClick={() => cycleShutterEffect('strobe')}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[13px] ${shutterState === 'strobe' ? 'bg-panel text-white' : 'text-zinc-300'} disabled:opacity-40`}
                >
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>
                  Strobe
                </button>
                <button
                  type="button"
                  aria-pressed={shutterState === 'pulse'}
                  disabled={!canEdit || shutter.pulseSlots.length === 0}
                  title={shutter.pulseSlots.length ? undefined : 'This fixture has no pulse range'}
                  onClick={() => cycleShutterEffect('pulse')}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[13px] ${shutterState === 'pulse' ? 'bg-panel text-white' : 'text-zinc-300'} disabled:opacity-40`}
                >
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18V3L3 21z" /></svg>
                  Pulse
                </button>
              </div>
              {(shutterState === 'strobe' || shutterState === 'pulse') && shutterSpeed && (
                <div className="mt-1 flex min-h-0 flex-1 gap-2">
                  <div className="flex w-10 flex-none flex-col items-center">
                    <FillFader
                      value={Math.round(shutterSpeed.position * 255)}
                      onChange={(next) => setShutterSpeed(next / 255)}
                      label={`${shutterState === 'strobe' ? 'Strobe' : 'Pulse'} speed for selected fixtures`}
                      fillColor="#f59e0b"
                      disabled={!canEdit}
                      trackClassName="design-fill-track"
                      selected={selectedControl === 'shutter'}
                    />
                    <span className="font-mono text-[12px] text-white">
                      {Math.round(shutterSpeed.position * 100)}%
                    </span>
                  </div>
                  <span className="min-w-0 flex-1 pt-1 text-[11px] leading-snug text-dim">
                    {shutterSpeed.slot.name}
                  </span>
                </div>
              )}
              {shutterState === 'mixed' && (
                <span className="px-1 pt-1 text-[11px] text-dim">Mixed</span>
              )}
            </div>
          </div>
        )}

        {/* Auto Program + Auto Program Speed (LightKey Guide p.314 —
            custom fixture properties, not built-ins; Jake's screenshot
            19 Nov 2026): the program is a list of options (Guide
            pp.110–111) showing "No Selection" until one is chosen, and
            the speed is its slider, showing "No Selection" until a
            program is chosen because its meaning depends on the
            selected option. The speed slider fans like any other slider
            property (Guide §8, p.118); the program list itself does
            not, and neither does Shutter/Strobe. */}
        {autoProgram && (
          <div className="flex min-h-0 shrink-0 flex-col gap-2">
            <div
              data-testid="auto-program-speed-card"
              className={`flex w-56 flex-none flex-col rounded-lg border-2 bg-panel2 p-2 ${selectedControl === 'autoProgramSpeed' ? 'border-[#0A84FF]' : 'border-line'}`}
              onPointerDown={(event) => { event.stopPropagation(); setSelectedControl('autoProgramSpeed') }}
              onFocus={() => setSelectedControl('autoProgramSpeed')}
            >
              <div className="flex flex-none items-center gap-2 pb-1">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: '#0A84FF' }} />
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-white">
                  <span className="truncate">Auto Program Speed</span>
                  {speedFan && <FanDeleteDot label="Auto Program Speed" onDelete={() => deleteFanKeep(speedFan)} />}
                  {showFanButtons && !speedFan && autoProgram.speedChannel && (
                    <FanMenuButton label="Auto Program Speed" items={[{ label: 'Add Auto Program Speed Fanning…', onSelect: () => dispatchFanHud({ attribute: autoProgram.speedChannel!.attribute }) }]} disabled={!canEdit} />
                  )}
                </span>
              </div>
              {speedFan ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <FannedIcon label="Auto Program Speed" onEdit={() => dispatchFanHud({ attribute: autoProgram.speedChannel!.attribute })} />
                </div>
              ) : programMixed ? (
                <span className="flex flex-1 items-center justify-center py-2 text-[13px] text-dim">Mixed</span>
              ) : programSlot && autoProgram.speedChannel && speedRange ? (
                <div className="flex min-h-0 flex-1 gap-2">
                  <div className="flex w-10 flex-none flex-col items-center">
                    <FillFader
                      value={speedFaderValue}
                      onChange={(next) => {
                        const range = speedRange
                        updateValues({ [autoProgram.speedChannel!.attribute]: Math.round(range.min + ((range.max - range.min) * next) / 255) })
                      }}
                      label="Auto Program Speed for selected fixtures"
                      fillColor="#f59e0b"
                      disabled={!canEdit}
                      trackClassName="design-fill-track"
                      selected={selectedControl === 'autoProgramSpeed'}
                    />
                    <span className="font-mono text-[12px] text-white">
                      {Math.round((speedFaderValue / 255) * 100)}%
                    </span>
                  </div>
                  <span className="min-w-0 flex-1 pt-1 text-[11px] leading-snug text-dim">
                    {programSlot.name}
                  </span>
                </div>
              ) : (
                <span className="flex flex-1 items-center justify-center py-2 text-[13px] text-dim">No Selection</span>
              )}
            </div>
            <div
              ref={programCardRef}
              data-testid="auto-program-card"
              className={`relative flex w-56 flex-none flex-col rounded-lg border-2 bg-panel2 p-2 ${selectedControl === 'autoProgram' ? 'border-[#0A84FF]' : 'border-line'}`}
              onPointerDown={(event) => { event.stopPropagation(); setSelectedControl('autoProgram') }}
              onFocus={() => setSelectedControl('autoProgram')}
            >
              <div className="flex flex-none items-center gap-2 pb-1">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: '#0A84FF' }} />
                <span className="text-[13px] text-white">Auto Program</span>
              </div>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={programListOpen}
                disabled={!canEdit}
                onClick={() => { setProgramListOpen((open) => !open); setProgramActiveId(programSlot?.id ?? '__none') }}
                onKeyDown={onProgramButtonKeyDown}
                className={`flex flex-none items-center justify-center rounded px-2 py-1.5 text-[13px] ${programSlot ? 'text-white' : 'text-dim'} disabled:opacity-40`}
              >
                {programMixed ? 'Mixed' : programSlot?.name ?? 'No Selection'}
              </button>
              {programListOpen && (
                <div role="listbox" aria-label="Auto Program" className="absolute inset-x-2 top-full z-10 max-h-48 overflow-y-auto rounded-lg border border-line bg-panel2 py-1 shadow-lg">
                  {programOptions.map((option) => (
                    <div
                      key={option.id}
                      role="option"
                      aria-selected={option.id === (programSlot?.id ?? '__none')}
                      onClick={() => selectProgramOption(option)}
                      onMouseEnter={() => setProgramActiveId(option.id)}
                      className={`cursor-pointer px-2 py-1 text-[13px] ${option.id === programActiveId ? 'bg-panel text-white' : 'text-zinc-300'}`}
                    >
                      {option.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {hasPanTilt && (
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-medium uppercase text-dim">
              {positionFan && <FanDeleteDot label="Position" onDelete={() => { deleteFanKeep(panFan); deleteFanKeep(tiltFan) }} />}
              Position
              <button type="button" className="normal-case text-dim hover:text-white" title="Add Position Effect…" aria-label="Add Position Effect…" disabled={!canEdit} onClick={(event) => { event.stopPropagation(); openEffectFor('position') }}>∿</button>
              {showFanButtons && !positionFan && (
                <FanMenuButton
                  label="Position"
                  items={[
                    { label: 'Add Pan Fanning…', onSelect: () => dispatchFanHud({ attribute: 'pan' }) },
                    { label: 'Add Tilt Fanning…', onSelect: () => dispatchFanHud({ attribute: 'tilt' }) },
                    { label: 'Add Pan + Tilt Fanning…', onSelect: () => dispatchFanHud({ attribute: 'pan', alsoAttribute: 'tilt' }) }
                  ]}
                  disabled={!canEdit}
                />
              )}
            </span>
            {positionEffect ? (
              <EffectIndicator effect={positionEffect} onEdit={() => setEditingEffectId(positionEffect.id)} />
            ) : positionFan ? (
              <div className="flex h-20 w-28 items-stretch">
                <FannedIcon label="Position" onEdit={() => dispatchFanHud({ attribute: panFan ? 'pan' : 'tilt' })} />
              </div>
            ) : (
              <>
                <PositionControl fixtures={selectedFixtures} update={updateValues} current={positionNow} />
                {/* Fixed 112px width, centred: the readout at its widest
                    ("Pan +270° · Tilt -135°") is wider than the circle,
                    and a widening column would shift the svg right
                    mid-drag (see PositionControl's frozen drag rect). */}
                <span className="w-28 whitespace-nowrap text-center font-mono text-[10px] text-dim">
                  Pan {positionNowDegrees ? `${positionNowDegrees.pan >= 0 ? '+' : ''}${Math.round(positionNowDegrees.pan)}°` : '—'} · Tilt {positionNowDegrees ? `${positionNowDegrees.tilt >= 0 ? '+' : ''}${Math.round(positionNowDegrees.tilt)}°` : '—'}
                </span>
              </>
            )}
          </div>
        )}

        {/* Channel faders: fixed 64px columns (LightKey's narrow vertical
            faders), scrolling horizontally when there are many — they no
            longer stretch into the wide Red / Green / Blue panels. */}
        <div className="flex h-full min-w-0 flex-1 gap-1 overflow-x-auto">
          {beam1Attributes.length === 0 && faderAttributes.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[10px] text-dim">
              {selectedFixtures.length > 0 ? 'No additional common channels' : 'Select fixtures in the preview to access controls'}
            </div>
          ) : (
            <>
            {beam1Attributes.map((attribute) => {
              // Faders read the resolved value — overrides, then cue,
              // then defaults (fixtureAttr) — and are NOT gated on an
              // active cue: Design writes live in manualOverrides with
              // no cue active, so gating blanked faders whose values
              // the wheel and the Dimmer already showed (Jake,
              // 20 Nov 2026). With nothing selected the value helpers
              // return 0 on their own.
              const value = beam1ValueFor(attribute)
              const channel = channelByAttribute.get(attribute)
              const beam1Effect = effectForAttribute(attribute)
              return (
                <div
                  key={`beam1-${attribute}`}
                  data-testid={`beam1-${attribute}`}
                  className="chan h-full min-w-7"
                  onPointerDown={(event) => { event.stopPropagation(); setSelectedControl(`beam1:${attribute}`) }}
                  onFocus={(event) => { event.stopPropagation(); setSelectedControl(`beam1:${attribute}`) }}
                >
                  <span className="flex items-center justify-center gap-0.5 text-[10px] leading-none text-dim">
                    {`${attributeLabel(attribute)} 1`}
                    <button type="button" className="text-dim hover:text-white" title={`Add ${attributeLabel(attribute)} Effect…`} aria-label={`Add ${attributeLabel(attribute)} Effect…`} disabled={!canEdit} onClick={(event) => { event.stopPropagation(); openEffectFor(attribute) }}>∿</button>
                  </span>
                  {beam1Effect ? (
                    <EffectIndicator effect={beam1Effect} onEdit={() => setEditingEffectId(beam1Effect.id)} />
                  ) : (
                    <>
                      <FillFader
                        value={value}
                        onChange={(next) => writeBeam1(attribute, next)}
                        label={`${attributeLabel(attribute)} 1 for selected fixtures`}
                        fillColor={channelFillColor(attribute)}
                        disabled={!canEdit}
                        trackClassName="design-fill-track"
                        selected={selectedControl === `beam1:${attribute}`}
                      />
                      <span className="text-center font-mono text-[11px] leading-none text-zinc-400">
                        {value}
                      </span>
                    </>
                  )}
                </div>
              )
            })}
            {faderAttributes.map((attribute) => {
              const value = valueFor(attribute)
              const fan = fanFor(attribute)
              // Only slider properties are fannable (Guide §8, p.118:
              // "any custom property represented by a slider") — wheel
              // slots and option lists get no fan button.
              const channel = channelByAttribute.get(attribute)
              const isSlider = !channel?.control || channel.control === 'slider'
              const channelEffect = effectForAttribute(attribute)
              return (
                <div
                  key={attribute}
                  className="chan h-full min-w-7"
                  // Its own control: clicking (or tabbing into) a fader
                  // selects that fader — the blue border — and stops
                  // here, so the panel's spare-space clear never fires
                  // for a control click.
                  onPointerDown={(event) => { event.stopPropagation(); setSelectedControl(`channel:${attribute}`) }}
                  onFocus={(event) => { event.stopPropagation(); setSelectedControl(`channel:${attribute}`) }}
                >
                  <span className="flex items-center justify-center gap-0.5 text-[10px] leading-none text-dim">
                    {fan && <FanDeleteDot label={attributeLabel(attribute)} onDelete={() => deleteFanKeep(fan)} />}
                    {attributeLabel(attribute)}
                    <button type="button" className="text-dim hover:text-white" title={`Add ${attributeLabel(attribute)} Effect…`} aria-label={`Add ${attributeLabel(attribute)} Effect…`} disabled={!canEdit} onClick={(event) => { event.stopPropagation(); openEffectFor(attribute) }}>∿</button>
                    {showFanButtons && !fan && isSlider && (
                      <FanMenuButton label={attributeLabel(attribute)} items={[{ label: `Add ${attributeLabel(attribute)} Fanning…`, onSelect: () => dispatchFanHud({ attribute }) }]} disabled={!canEdit} />
                    )}
                  </span>
                  {channelEffect ? (
                    <EffectIndicator effect={channelEffect} onEdit={() => setEditingEffectId(channelEffect.id)} />
                  ) : fan ? (
                    <FannedIcon label={attributeLabel(attribute)} onEdit={() => dispatchFanHud({ attribute })} />
                  ) : (
                    <>
                      <FillFader
                        value={value}
                        onChange={(next) => updateValues({ [attribute]: next })}
                        label={`${attributeLabel(attribute)} for selected fixtures`}
                        fillColor={channelFillColor(attribute)}
                        disabled={!canEdit}
                        trackClassName="design-fill-track"
                        selected={selectedControl === `channel:${attribute}`}
                      />
                      <span className="text-center font-mono text-[11px] leading-none text-zinc-400">
                        {value}
                      </span>
                    </>
                  )}
                </div>
              )
            })}
            </>
          )}
        </div>
      </div>

      {/* Colour favourites strip removed 19 Nov 2026 (Jake): the
          "COLOUR FAVOURITES" bar at the bottom of the panel made the
          space too busy. The store actions (addColorFavorite /
          removeColorFavorite, show.colorFavorites) and the migration are
          untouched, so saved favourites still load and persist — but
          there is now no UI anywhere to save or apply one; see NOTES.md.
          Colours are still applied with the wheel and the centre picker. */}
    </div>
  )
}
