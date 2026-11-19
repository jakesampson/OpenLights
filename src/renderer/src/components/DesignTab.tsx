import type { FanDef } from '@shared/types'
import { fixtureMode } from '@shared/fixtureProfiles'
import { availableProperties } from '../lib/availableProperties'
import { fixtureAttributes } from '../lib/automationRuntime'
import { hexToRgb, rgbToHex } from '../lib/colorMix'
import { hsvToRgb, rgbToHsv } from '../lib/colorWheel'
import { useShowStore } from '../stores/showStore'
import { ColorWheelControl } from './ColorWheelControl'
import { FillFader } from './FillFader'
import { PositionControl } from './PositionControl'
import { dispatchFanHud, FanDeleteDot, FanMenuButton, FannedIcon } from './PropertyFan'

const POSITION_ATTRIBUTES = ['pan', 'tilt', 'panFine', 'tiltFine']

// Colour attributes the round Color control owns (LightKey Guide p.82–
// 85): Red/Green/Blue (or Cyan/Magenta/Yellow) are driven by the hue
// wheel, and the additional colour channels by the wheel's inner arcs —
// so they are not rendered as channel faders when the wheel is shown.
// A fixture the wheel does not support keeps its faders as the fallback.
const COLOUR_FADER_ATTRIBUTES = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white', 'amber', 'uv', 'lime']
// Additional colour channels (Guide p.85: cool/warm white, amber, lime,
// ultraviolet) that appear as inner arcs in the wheel's centre — only
// when the selected fixtures actually have them.
const ADDITIONAL_COLOUR_ATTRIBUTES = ['white', 'amber', 'uv', 'lime']

function attributeLabel(attribute: string) {
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
    updateSelectedBeamValues,
    updateSelectedFixtures,
    setSelectedColor,
    addColorFavorite,
    removeColorFavorite,
    editingPresetId,
    updateEditingPresetValues,
    deleteFan,
  } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const activeCue = cues.find((cue) => cue.id === activeCueId)
  // In-place preset editing (LightKey, Guide ch.9): the bottom panel edits
  // the preset's own values, not the active cue's. Where the preset does
  // not define an attribute for a fixture, the cue value shows as the
  // starting point; moving a control writes it into the preset.
  const editingPreset = editingPresetId ? presets.find((p) => p.id === editingPresetId) : undefined
  const fixtureAttr = (fixtureId: string, attribute: string, fallback: number) =>
    editingPreset?.fixtureValues[fixtureId]?.[attribute] ?? activeCue?.fixtureValues[fixtureId]?.[attribute] ?? fallback
  const selectedFixtures = fixtures.filter((fixture) => selectedFixtureIds.includes(fixture.id))
  const beamProperties = selectedBeams.map((b) => { const f = fixtures.find((f) => f.id === b.fixtureId); return f && fixtureMode(f)?.beams?.find((beam) => beam.id === b.beamId)?.properties }).filter((b): b is Record<string, string> => Boolean(b))
  const commonAttributes = beamProperties.length ? Object.keys(beamProperties[0]).filter((key) => beamProperties.every((b) => key in b)) : availableProperties(selectedFixtures).map((property) => property.attribute)
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
            (total, fixture) => total + fixtureAttr(fixture.id, attribute, fixture.type === 'dimmer' && ['red', 'green', 'blue'].includes(attribute) ? 255 : 0),
            0
          ) / selectedFixtures.length
        )
      : 0
  const dimmer = editingPreset || activeCue ? valueFor('intensity') : 0
  const updateValues = editingPreset ? updateEditingPresetValues
    : selectedBeams.length ? (values: Record<string, number>) => updateSelectedBeamValues(values, false) : updateSelectedFixtures
  const colorValues = {
    red: commonAttributes.includes('cyan') ? 255 - valueFor('cyan') : Math.min(255, valueFor('red') + valueFor('white') + valueFor('amber')),
    green: commonAttributes.includes('magenta') ? 255 - valueFor('magenta') : Math.min(255, valueFor('green') + valueFor('white') + valueFor('amber') * 0.45),
    blue: commonAttributes.includes('yellow') ? 255 - valueFor('yellow') : Math.min(255, valueFor('blue') + valueFor('white'))
  }
  const colorSupported = previewOnlyColor || ['cyan', 'magenta', 'yellow'].every((a) => commonAttributes.includes(a)) || ['red', 'green', 'blue'].every((attribute) =>
    commonAttributes.includes(attribute)
  )
  const colorFavorites = show?.colorFavorites ?? []
  const hsv = rgbToHsv(colorValues)
  const additionalColourAttributes = commonAttributes.filter((a) => ADDITIONAL_COLOUR_ATTRIBUTES.includes(a))
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

  // Per-property fanning (LightKey Guide §8, p.118–123): each property's
  // own control carries the entry point — the property name's menu,
  // "Add (property name) Fanning…" — and when a property is fanned its
  // area shows an icon instead of the normal controls. Fans live on the
  // active cue; beams are not fanned (existing gap, see NOTES.md), and
  // fanning is hidden while editing a preset (fans are cue-level).
  const fans = activeCue?.fans ?? []
  const fanFor = (attribute: string) => fans.find((f) => f.attribute === attribute && f.fixtureIds.some((id) => selectedFixtureIds.includes(id)))
  const deleteFanKeep = (fan: FanDef | undefined) => { if (fan) deleteFan(fan.id, true) }
  const showFanButtons = !editingPreset && selectedBeams.length === 0
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
      <div className="flex min-h-0 flex-1 items-stretch gap-3">
        {/* Dimmer: the shared FillFader — the same LightKey-style solid
            fill bar as the Master fader (lavender fill), not a thin line
            with a round knob. */}
        <div className="flex w-16 shrink-0 flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-[11px] font-medium uppercase text-dim">
            {dimmerFan && <FanDeleteDot label="Dimmer" onDelete={() => deleteFanKeep(dimmerFan)} />}
            Dimmer
            {showFanButtons && !dimmerFan && dimmerSupported && (
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
                disabled={!canEdit || !dimmerSupported}
                trackClassName="design-fill-track"
              />
              <span className="font-mono text-[12px] text-white">
                {dimmerSupported ? `${Math.round((dimmer / 255) * 100)}%` : '—'}
              </span>
            </>
          )}
        </div>

        {/* Colour: LightKey's round control (Guide p.82–85) — the outer
            hue ring, saturation and brightness as inner arcs, and one
            inner arc per additional colour channel the fixtures have
            (White / Amber / UV …). The centre disc opens the system
            colour window. The per-channel colour faders are gone: the
            wheel is the colour control. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-[11px] font-medium uppercase text-dim">
            {colorFan && <FanDeleteDot label="Colour" onDelete={() => deleteFanKeep(colorFan)} />}
            {previewOnlyColor ? 'Preview colour' : 'Colour'}
            {showFanButtons && !colorFan && colorSupported && (
              <FanMenuButton label="Colour" items={[{ label: 'Add Colour Fanning…', onSelect: () => dispatchFanHud({ attribute: 'color' }) }]} disabled={!canEdit} />
            )}
          </span>
          {colorFan ? (
            <div className="flex h-[150px] w-[150px] items-stretch">
              <FannedIcon label="Colour" onEdit={() => dispatchFanHud({ attribute: 'color' })} />
            </div>
          ) : (
            <ColorWheelControl
              hsv={hsv}
              extraChannels={additionalColourAttributes.map((attribute) => ({
                attribute,
                label: attributeLabel(attribute),
                value: valueFor(attribute),
                color: channelFillColor(attribute)
              }))}
              centreHex={colorHex(colorValues)}
              disabled={!canEdit || !colorSupported}
              onHsvChange={(next) => setColor(rgbToHex(hsvToRgb(next.h, next.s, next.v)))}
              onExtraChange={(attribute, next) => updateValues({ [attribute]: next })}
              onCentrePick={(hex) => setColor(hex)}
            />
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
