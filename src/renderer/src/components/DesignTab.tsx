import { fixtureMode } from '@shared/fixtureProfiles'
import { availableProperties } from '../lib/availableProperties'
import { fixtureAttributes } from '../lib/automationRuntime'
import { colorWheelPosition } from '../lib/colorWheel'
import { hexToRgb } from '../lib/colorMix'
import { useShowStore } from '../stores/showStore'
import { FillFader } from './FillFader'
import { PositionControl } from './PositionControl'

const POSITION_ATTRIBUTES = ['pan', 'tilt', 'panFine', 'tiltFine']

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
  const wheelPosition = colorWheelPosition(colorValues)

  const setColor = (hex: string) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return
    if (editingPreset) updateEditingPresetValues({ ...rgb })
    else if (selectedBeams.length) updateSelectedBeamValues({ ...rgb }, false)
    else setSelectedColor(rgb, false)
  }

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
        {/* Fanning entry point (LightKey Guide §8, p.119: click a fixture
            property's name in the Design view, then choose Add Fanning…).
            This button is that entry point — it opens the Fanning HUD in
            the Preview, around the fixtures' icons, for the selection's
            default property; the HUD itself lets the property be changed.
            It is a single entry point, not a fanning section in the panel
            (the section was removed at Jake's request — see NOTES.md). */}
        <button
          type="button"
          className="rounded bg-panel2 px-2 py-1 text-xs disabled:opacity-40"
          disabled={selectedFixtures.length === 0}
          onClick={() => window.dispatchEvent(new CustomEvent('openlights-open-fan-hud', { detail: {} }))}
          title="Fan a property across the selected fixtures (LightKey Guide §8, p.118–122)"
        >Fan…{activeCue?.fans?.length ? ` (${activeCue.fans.length})` : ''}</button>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-3">
        {/* Dimmer: the shared FillFader — the same LightKey-style solid
            fill bar as the Master fader (lavender fill), not a thin line
            with a round knob. */}
        <div className="flex w-16 shrink-0 flex-col items-center gap-0.5">
          <span className="text-[11px] font-medium uppercase text-dim">Dimmer</span>
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
        </div>

        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="text-[11px] font-medium uppercase text-dim">{previewOnlyColor ? 'Preview colour' : 'Colour'}</span>
          <div className="wheel relative" style={{ width: 84, height: 84 }}>
            <input
              type="color"
              value={colorHex(colorValues)}
              disabled={!canEdit || !colorSupported}
              aria-label="Colour for selected fixtures"
              onChange={(event) => setColor(event.target.value)}
              className="wheel-input"
            />
            {colorSupported && selectedFixtures.length > 0 && (
              <span
                className="wheel-marker"
                style={{
                  left: `${wheelPosition.x}%`,
                  top: `${wheelPosition.y}%`,
                  backgroundColor: colorHex(colorValues)
                }}
                aria-hidden="true"
              />
            )}
          </div>
          <span className="font-mono text-[10px] text-dim">
            {colorSupported && selectedFixtures.length > 0
              ? `RGB ${colorValues.red}·${colorValues.green}·${colorValues.blue}`
              : 'RGB —'}
          </span>
        </div>

        {hasPanTilt && (
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <span className="text-[11px] font-medium uppercase text-dim">Position</span>
            <PositionControl fixtures={selectedFixtures} update={updateValues} />
            <span className="font-mono text-[10px] text-dim">
              Pan {activeCue ? valueFor('pan') : 0} · Tilt {activeCue ? valueFor('tilt') : 0}
            </span>
          </div>
        )}

        {/* Channel faders: fixed 64px columns (LightKey's narrow vertical
            faders), scrolling horizontally when there are many — they no
            longer stretch into the wide Red / Green / Blue panels. */}
        <div className="flex h-full min-w-0 flex-1 gap-1 overflow-x-auto">
          {channelAttributes.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[10px] text-dim">
              {selectedFixtures.length > 0 ? 'No additional common channels' : 'Select fixtures in the preview to access controls'}
            </div>
          ) : (
            channelAttributes.map((attribute) => {
              const value = activeCue ? valueFor(attribute) : 0
              return (
                <div key={attribute} className="chan h-full min-w-7">
                  <span className="text-center text-[10px] leading-none text-dim">
                    {attributeLabel(attribute)}
                  </span>
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
