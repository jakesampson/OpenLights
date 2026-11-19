import { useEffect, useRef, useState } from 'react'
import type { FanDef, FixtureDef } from '@shared/types'
import { fixtureBeams, fixtureMode } from '@shared/fixtureProfiles'
import { resolveCueValues } from '@shared/cueResolution'
import { availableProperties } from '../lib/availableProperties'
import { fixtureAttributes } from '../lib/automationRuntime'
import { hexToRgb, rgbToHex, colorChannels } from '../lib/colorMix'
import { displayHsv, hsvToRgb, rgbToHsv } from '../lib/colorWheel'
import { useShowStore, defaultFixtureValues } from '../stores/showStore'
import { ColorWheelControl } from './ColorWheelControl'
import { FillFader } from './FillFader'
import { PositionControl } from './PositionControl'
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

// The selected Design control (Jake, 19 Nov 2026): the blue #0A84FF
// border marks the one control the shortcuts act on, so you can see
// which value the arrow keys will adjust. Clicking a control selects
// it; clicking spare space in the panel clears it. The wheel is one
// control ('colour' — the whole card); each fader is its own.
type SelectedDesignControl = 'colour' | 'dimmer' | `slider:${string}` | `channel:${string}`

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
function channelFillColor(attribute: string) {
  switch (attribute) {
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

function colorHex(values: Record<string, number>) {
  const hex = (attribute: string) =>
    Math.max(0, Math.min(255, Math.round(values[attribute] ?? 0)))
      .toString(16)
      .padStart(2, '0')
  return `#${hex('red')}${hex('green')}${hex('blue')}`
}

export function DesignTab() {
  const {
    show,
    cues,
    presets,
    activeCueId,
    selectedFixtureIds,
    selectedBeams,
    updateSelectedBeamValues,
    updateSelectedFixtures,
    setSelectedColor,
    setSelectedBaseColor,
    setColorDefault,
    loadColorDefault,
    resetColorDefault,
    editingPresetId,
    updateEditingPresetValues,
    deleteFan,
  } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const activeCue = cues.find((cue) => cue.id === activeCueId)
  // The cue's resolved look (Piece 8): its presets in order, then its
  // ad-hoc values. The panel reads the resolved look, so a property
  // defined by a preset shows in the controls; writes still target the
  // cue's ad-hoc layer (updateValues / setSelectedColor write
  // cue.fixtureValues), which wins over the preset.
  const cueValues = activeCue ? resolveCueValues(activeCue, presets) : {}
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
    return editingPreset?.fixtureValues[fixtureId]?.[attribute] ?? cueValues[fixtureId]?.[attribute] ?? (fixture ? defaultFixtureValues(fixture)[attribute] : undefined) ?? fallback
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
  // Pan/tilt as one XY pad (LightKey-style position control) instead of two
  // raw 0–255 sliders — only when every selected fixture has pan+tilt and no
  // individual beam is selected (beam values are keyed by beam property, not
  // by pan/tilt). Otherwise the raw sliders stay as the fallback.
  const hasPanTilt = selectedBeams.length === 0 && selectedFixtures.length > 0 &&
    selectedFixtures.every((fixture) => fixtureAttributes(fixture).includes('pan') && fixtureAttributes(fixture).includes('tilt'))
  const channelAttributes = selectedFixtures.length
    ? commonAttributes.filter((attribute) => attribute !== 'intensity' && !(hasPanTilt && POSITION_ATTRIBUTES.includes(attribute)))
    : []
  const canEdit = Boolean(show && selectedFixtures.length > 0)
  const dimmerSupported = commonAttributes.includes('intensity')
  const previewOnlyColor = selectedFixtures.length > 0 && selectedFixtures.every((fixture) => fixture.type === 'dimmer')
  const valueFor = (attribute: string) => selectedBeams.length ? Math.round(selectedBeams.reduce((sum, b) => { const f = fixtures.find((f) => f.id === b.fixtureId), key = f && fixtureMode(f)?.beams?.find((beam) => beam.id === b.beamId)?.properties[attribute]; return sum + (key ? fixtureAttr(b.fixtureId, key, 0) : 0) }, 0) / selectedBeams.length) :
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
  const updateValues = editingPreset ? updateEditingPresetValues
    : selectedBeams.length ? (values: Record<string, number>) => updateSelectedBeamValues(values, false) : updateSelectedFixtures
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
    : activeColorProperty ? percentHeaderText(((activeCue ? valueFor(activeColorProperty) : 0) / 255) * 100)
    : null
  const additionalColourAttributes = commonAttributes.filter((a) => ADDITIONAL_COLOUR_ATTRIBUTES.includes(a))
  // "Reset Default" only belongs on the Colour menu once a fixture has a
  // custom default colour stored; "Load Default" is always offered (with
  // no custom default it loads the built-in blue).
  const hasCustomColorDefault = selectedFixtures.some((fixture) =>
    colorChannels(fixtureAttributes(fixture)).some((attribute) => fixture.defaultValues?.[attribute] !== undefined)
  )
  // The colour channels the wheel owns are not also channel faders — but
  // only when the wheel is shown; a fixture it does not support keeps
  // its faders as the fallback.
  const faderAttributes = colorSupported
    ? channelAttributes.filter((attribute) => !COLOUR_FADER_ATTRIBUTES.includes(attribute))
    : channelAttributes
  const channelByAttribute = new Map(availableProperties(selectedFixtures).map((c) => [c.attribute, c]))

  const setColor = (hex: string) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return
    if (editingPreset) updateEditingPresetValues({ ...rgb })
    else if (selectedBeams.length) updateSelectedBeamValues({ ...rgb }, false)
    else setSelectedColor(rgb, false)
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
    else if (selectedBeams.length) updateSelectedBeamValues({ ...rgb }, false)
    else setSelectedBaseColor(rgb, false)
  }

  // Per-property fanning (LightKey Guide §8, p.118–123): each property's
  // own control carries the entry point — the property name's menu,
  // "Add (property name) Fanning…" — and when a property is fanned its
  // area shows an icon instead of the normal controls. Fans live on the
  // active cue; fanning is hidden while editing a preset (fans are
  // cue-level). With beams selected the fan opens across those beams
  // (Guide p.119) — see StagePreview openFanHud.
  const fans = activeCue?.fans ?? []
  const fanFor = (attribute: string) => fans.find((f) => f.attribute === attribute && f.fixtureIds.some((id) => selectedFixtureIds.includes(id)))
  const deleteFanKeep = (fan: FanDef | undefined) => { if (fan) deleteFan(fan.id, true) }
  const showFanButtons = !editingPreset
  const dimmerFan = fanFor('intensity')
  const colorFan = fanFor('color')
  const panFan = fanFor('pan')
  const tiltFan = fanFor('tilt')
  const positionFan = panFan ?? tiltFan

  return (
    <div
      ref={inspectorRef}
      className="design-fixture-inspector flex h-full min-h-0 flex-col gap-2 overflow-hidden"
      // Spare-space click (Jake, 19 Nov 2026): a pointerdown landing on
      // empty space in the panel clears the control selection. Control
      // clicks never reach here — each control's wrapper stops
      // propagation on pointerdown — so this only fires for spare
      // space. The Position pad is not a selectable control: clicking
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
      <div className="flex min-h-0 flex-1 items-stretch gap-3">
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
            {showFanButtons && !dimmerFan && dimmerAvailable && (
              <FanMenuButton label="Dimmer" items={[{ label: 'Add Dimmer Fanning…', onSelect: () => dispatchFanHud({ attribute: 'intensity' }) }]} disabled={!canEdit} />
            )}
          </span>
          {dimmerFan ? (
            <div className="flex w-full flex-1 items-stretch">
              <FannedIcon label="Dimmer" onEdit={() => dispatchFanHud({ attribute: 'intensity' })} />
            </div>
          ) : (
            <>
              <FillFader
                value={dimmer}
                onChange={(next) => updateValues({ intensity: next })}
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
          {colorFan ? (
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
                  wheel itself does not apply. */}
              {additionalColourAttributes.map((attribute) => {
                const value = activeCue ? valueFor(attribute) : 0
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
          {/* No numeric RGB readout under the wheel (Jake, 19 Nov 2026):
              the green channel printed a raw float (9.450000000000001,
              from amber × 0.45 in colorValues) and the long value broke
              the panel layout. The wheel + marker show the colour; the
              only other readouts in this panel are already integers —
              Dimmer % (Math.round), Pan/Tilt and channel values
              (valueFor, which rounds). */}
        </div>

        {hasPanTilt && (
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-medium uppercase text-dim">
              {positionFan && <FanDeleteDot label="Position" onDelete={() => { deleteFanKeep(panFan); deleteFanKeep(tiltFan) }} />}
              Position
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
            {positionFan ? (
              <div className="flex h-20 w-28 items-stretch">
                <FannedIcon label="Position" onEdit={() => dispatchFanHud({ attribute: panFan ? 'pan' : 'tilt' })} />
              </div>
            ) : (
              <>
                <PositionControl fixtures={selectedFixtures} update={updateValues} />
                <span className="font-mono text-[10px] text-dim">
                  Pan {activeCue ? valueFor('pan') : 0} · Tilt {activeCue ? valueFor('tilt') : 0}
                </span>
              </>
            )}
          </div>
        )}

        {/* Channel faders: fixed 64px columns (LightKey's narrow vertical
            faders), scrolling horizontally when there are many — they no
            longer stretch into the wide Red / Green / Blue panels. */}
        <div className="flex h-full min-w-0 flex-1 gap-1 overflow-x-auto">
          {faderAttributes.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[10px] text-dim">
              {selectedFixtures.length > 0 ? 'No additional common channels' : 'Select fixtures in the preview to access controls'}
            </div>
          ) : (
            faderAttributes.map((attribute) => {
              const value = activeCue ? valueFor(attribute) : 0
              const fan = fanFor(attribute)
              // Only slider properties are fannable (Guide §8, p.118:
              // "any custom property represented by a slider") — wheel
              // slots and option lists get no fan button.
              const channel = channelByAttribute.get(attribute)
              const isSlider = !channel?.control || channel.control === 'slider'
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
                    {showFanButtons && !fan && isSlider && (
                      <FanMenuButton label={attributeLabel(attribute)} items={[{ label: `Add ${attributeLabel(attribute)} Fanning…`, onSelect: () => dispatchFanHud({ attribute }) }]} disabled={!canEdit} />
                    )}
                  </span>
                  {fan ? (
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
            })
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
