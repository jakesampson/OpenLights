import { useEffect, useState } from 'react'
import type { FanDef, FixtureDef } from '@shared/types'
import { fixtureMode } from '@shared/fixtureProfiles'
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
    updateCue,
    updateSelectedBeamValues,
    updateSelectedFixtures,
    setSelectedColor,
    setSelectedBaseColor,
    setColorDefault,
    loadColorDefault,
    resetColorDefault,
    addColorFavorite,
    removeColorFavorite,
    editingPresetId,
    updateEditingPresetValues,
    deleteFan,
  } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const sequences = show?.sequences ?? []
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
            // fixture's RGB (it shows white) and for a virtual dimmer
            // (a fixture with colour channels but no dimmer channel is
            // full open until its dimmer is set — LightKey shows
            // "Full" for a fresh RGBAW fixture); 0 otherwise (a
            // fixture with a dimmer channel starts dark).
            (total, fixture) => total + fixtureAttr(fixture.id, attribute, fixture.type === 'dimmer' && ['red', 'green', 'blue'].includes(attribute) ? 255 : attribute === 'intensity' && isVirtualDimmer(fixture) ? 255 : 0),
            0
          ) / selectedFixtures.length
        )
      : 0
  // The dimmer reads the effective intensity — the cue or preset value,
  // else the fixture's default (100% for a dimmer channel since Piece
  // 13, full open for a virtual dimmer, dark for a fixture with
  // neither). With no cue at all the defaults still apply, so a fresh
  // fixture reads 100% here and is lit in the output.
  const dimmer = valueFor('intensity')
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
    red: commonAttributes.includes('cyan') ? 255 - valueFor('cyan') : valueFor('red'),
    green: commonAttributes.includes('magenta') ? 255 - valueFor('magenta') : valueFor('green'),
    blue: commonAttributes.includes('yellow') ? 255 - valueFor('yellow') : valueFor('blue')
  }
  const colorValues = {
    red: commonAttributes.includes('cyan') ? 255 - valueFor('cyan') : Math.min(255, valueFor('red') + valueFor('white') + valueFor('amber')),
    green: commonAttributes.includes('magenta') ? 255 - valueFor('magenta') : Math.min(255, valueFor('green') + valueFor('white') + valueFor('amber') * 0.45),
    blue: commonAttributes.includes('yellow') ? 255 - valueFor('yellow') : Math.min(255, valueFor('blue') + valueFor('white'))
  }
  const colorSupported = previewOnlyColor || ['cyan', 'magenta', 'yellow'].every((a) => commonAttributes.includes(a)) || ['red', 'green', 'blue'].every((attribute) =>
    commonAttributes.includes(attribute)
  )
  // The virtual dimmer (Piece 12): colour fixtures without a dimmer
  // channel still get a working Dimmer fader.
  const virtualDimmerSupported = !dimmerSupported && colorSupported
  const dimmerAvailable = dimmerSupported || virtualDimmerSupported
  const colorFavorites = show?.colorFavorites ?? []
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
  const selectionKey = `${selectedFixtureIds.join(',')}|${activeCueId ?? ''}|${editingPresetId ?? ''}`
  useEffect(() => {
    const raw = rgbToHsv(baseColorValues)
    if (raw.s > 0 && raw.v > 0) setPreservedHsv({ h: raw.h, s: raw.s, v: raw.v })
    else if (raw.v > 0) setPreservedHsv((prev) => ({ ...prev, s: raw.s, v: raw.v }))
    // Black: there is no real saturation or brightness to show, so the
    // wheel starts at 100/100 (see above) instead of 0/0. The hue is
    // kept from whatever the wheel last chose.
    else setPreservedHsv((prev) => ({ ...prev, s: 100, v: 100 }))
    // Sync only when the selection or cue changes — the wheel's own
    // drags update the preserved HSV through onHsvChange below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])
  const hsv = displayHsv(rawHsv, preservedHsv)
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
  // stay exactly where their sliders left them. The centre picker and
  // colour favourites still use setColor above: applying a whole colour
  // may use the extra emitters to reproduce it.
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
    <div className="design-fixture-inspector flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span
          className={
            selectedFixtures.length > 0
              ? 'text-sm font-semibold text-white'
              : 'text-[10px] text-dim'
          }
        >
          {selectedFixtures.length > 0
            ? `${selectedFixtures.length} fixture${selectedFixtures.length === 1 ? '' : 's'} selected`
            : 'Select fixture(s) on stage'}
        </span>
        {editingPreset
          ? <span className="rounded bg-yellow-400 px-2 py-0.5 text-[10px] font-semibold text-black">Editing preset “{editingPreset.name}” — changes save to the preset</span>
          : !activeCue && selectedFixtures.length > 0 && <span className="text-[10px] text-dim">No active cue — editing starts a new one</span>}
      </div>
      {/* Cue contents (Piece 8, LightKey Guide ch.11 p.199): the presets
          and sequences this cue is built from, in order — where two
          define the same property the later one wins. The cue's own
          values are the ad-hoc properties, edited with the controls
          below; a preset edit updates every cue that references it. */}
      {activeCue && !editingPreset && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 text-[11px]" aria-label="Cue contents">
          <span className="text-dim">Contents:</span>
          {(activeCue.presetIds ?? []).map((id) => {
            const preset = presets.find((p) => p.id === id)
            return (
              <span key={id} title="Preset" className="inline-flex items-center gap-1 rounded bg-panel2 px-1.5 py-0.5">
                {preset?.name ?? 'Missing preset'}
                <button type="button" aria-label={`Remove ${preset?.name ?? 'preset'} from cue`} onClick={() => updateCue(activeCue.id, { presetIds: (activeCue.presetIds ?? []).filter((item) => item !== id) })}>×</button>
              </span>
            )
          })}
          {(activeCue.sequenceIds ?? []).map((id) => {
            const sequence = sequences.find((s) => s.id === id)
            return (
              <span key={id} title="Sequence" className="inline-flex items-center gap-1 rounded bg-panel2 px-1.5 py-0.5">
                {sequence?.name ?? 'Missing sequence'} (seq)
                <button type="button" aria-label={`Remove ${sequence?.name ?? 'sequence'} from cue`} onClick={() => updateCue(activeCue.id, { sequenceIds: (activeCue.sequenceIds ?? []).filter((item) => item !== id) })}>×</button>
              </span>
            )
          })}
          <span className="text-dim">Ad hoc: {Object.values(activeCue.fixtureValues ?? {}).reduce((n, patch) => n + Object.keys(patch).length, 0)} properties</span>
          <select aria-label="Add preset to cue" value="" onChange={(event) => { if (event.target.value) updateCue(activeCue.id, { presetIds: [...(activeCue.presetIds ?? []), event.target.value] }) }} className="rounded bg-panel2 px-1 py-0.5">
            <option value="">+ Preset…</option>
            {presets.filter((p) => !(activeCue.presetIds ?? []).includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Add sequence to cue" value="" onChange={(event) => { if (event.target.value) updateCue(activeCue.id, { sequenceIds: [...(activeCue.sequenceIds ?? []), event.target.value] }) }} className="rounded bg-panel2 px-1 py-0.5">
            <option value="">+ Sequence…</option>
            {sequences.filter((s) => !(activeCue.sequenceIds ?? []).includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-stretch gap-3">
        {/* Dimmer: the shared FillFader — the same LightKey-style solid
            fill bar as the Master fader (lavender fill), not a thin line
            with a round knob. */}
        <div className="flex w-16 shrink-0 flex-col items-center gap-0.5">
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
              />
              <span className="font-mono text-[12px] text-white">
                {dimmerAvailable ? `${Math.round((dimmer / 255) * 100)}%` : '—'}
              </span>
            </>
          )}
        </div>

        {/* Colour: LightKey's round control (Guide p.82–85) — the outer
            hue ring, saturation and brightness as inner arcs — plus the
            additional-colour sliders beside it (Guide pp.85–86, verified
            by Jake in LightKey 19 Nov 2026: White / Amber / UV are
            sliders next to the main colour control, not inner arcs).
            The centre disc opens the system colour window. The
            per-channel colour faders are gone: the wheel + its sliders
            are the colour control. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-[11px] font-medium uppercase text-dim">
            {colorFan && <FanDeleteDot label="Colour" onDelete={() => deleteFanKeep(colorFan)} />}
            {previewOnlyColor ? 'Preview colour' : 'Colour'}
            {showFanButtons && !colorFan && colorSupported && (
              <FanMenuButton label="Colour" title="Colour options" items={[
                { label: 'Add Colour Fanning…', onSelect: () => dispatchFanHud({ attribute: 'color' }) },
                { label: 'Set as Default', onSelect: () => setColorDefault() },
                { label: 'Load Default', onSelect: () => loadColorDefault() },
                ...(hasCustomColorDefault ? [{ label: 'Reset Default', onSelect: () => resetColorDefault() }] : []),
              ]} disabled={!canEdit} />
            )}
          </span>
          {colorFan ? (
            <div className="flex h-[150px] w-[150px] items-stretch">
              <FannedIcon label="Colour" onEdit={() => dispatchFanHud({ attribute: 'color' })} />
            </div>
          ) : (
            <div className="flex items-stretch gap-1">
              <ColorWheelControl
                hsv={hsv}
                centreHex={colorHex(colorValues)}
                disabled={!canEdit || !colorSupported}
                onHsvChange={(next) => { setPreservedHsv({ h: next.h, s: next.s, v: next.v }); setWheelColor(rgbToHex(hsvToRgb(next.h, next.s, next.v))) }}
                onCentrePick={(hex) => {
                  const picked = hexToRgb(hex)
                  if (picked) { const p = rgbToHsv({ red: picked.red, green: picked.green, blue: picked.blue }); if (p.s > 0 && p.v > 0) setPreservedHsv({ h: p.h, s: p.s, v: p.v }) }
                  setColor(hex)
                }}
              />
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
                  <div key={attribute} className="chan">
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
                          onChange={(next) => updateValues({ [attribute]: next })}
                          label={`${attributeLabel(attribute)} for selected fixtures`}
                          fillColor={channelFillColor(attribute)}
                          disabled={!canEdit}
                          trackClassName="design-fill-track"
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
                <div key={attribute} className="chan h-full min-w-7">
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

      {/* Colour favourites (LightKey Guide p.86): saved colours appear below
          the colour controls in the Design view, are stored in the project,
          and clicking one applies it to the selection — via the same setColor
          path as the colour picker, so it also works while editing a preset
          or with beams selected. LightKey saves a favourite by dragging the
          current colour onto a swatch; OpenLights has no draggable colour
          centre (the picker is a native colour input), so a "+" button saves
          the current colour instead — see NOTES.md. The "×" removes a
          favourite; LightKey has no remove gesture to copy. Nothing else in
          this panel changed. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 pt-1" aria-label="Colour favourites">
        <span className="text-[11px] font-medium uppercase text-dim">Colour favourites</span>
        {colorFavorites.length === 0 && (
          <span className="text-[10px] text-dim">No favourites yet — save the current colour with +</span>
        )}
        {colorFavorites.map((favorite) => (
          <span key={favorite} className="flex items-center">
            <button
              type="button"
              title={`Apply colour favourite ${favorite}`}
              aria-label={`Apply colour favourite ${favorite}`}
              disabled={!canEdit}
              onClick={() => setColor(favorite)}
              className="h-5 w-5 rounded-sm border border-white/30 disabled:opacity-40"
              style={{ backgroundColor: favorite }}
            />
            <button
              type="button"
              title={`Remove colour favourite ${favorite}`}
              aria-label={`Remove colour favourite ${favorite}`}
              onClick={() => removeColorFavorite(favorite)}
              className="px-0.5 text-[12px] leading-none text-dim hover:text-white"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          title="Save current colour as favourite"
          aria-label="Save current colour as favourite"
          disabled={!canEdit || !colorSupported}
          onClick={() => addColorFavorite(colorHex(colorValues))}
          className="btn-theme px-2 py-0.5 text-xs"
        >
          +
        </button>
      </div>
    </div>
  )
}
