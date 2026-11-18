import { fixtureMode } from '@shared/fixtureProfiles'
import { availableProperties } from '../lib/availableProperties'
import { fixtureAttributes } from '../lib/automationRuntime'
import { colorWheelPosition } from '../lib/colorWheel'
import { useShowStore } from '../stores/showStore'
import { FanningEditor } from './FanningEditor'
import { PositionControl } from './PositionControl'

const POSITION_ATTRIBUTES = ['pan', 'tilt', 'panFine', 'tiltFine']

function attributeLabel(attribute: string) {
  return attribute.charAt(0).toUpperCase() + attribute.slice(1)
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
  const wheelPosition = colorWheelPosition(colorValues)

  const setColor = (hex: string) => {
    const rgb = { red: parseInt(hex.slice(1, 3), 16), green: parseInt(hex.slice(3, 5), 16), blue: parseInt(hex.slice(5, 7), 16) }
    if (editingPreset) updateEditingPresetValues(rgb)
    else if (selectedBeams.length) updateSelectedBeamValues(rgb, false)
    else setSelectedColor(rgb, false)
  }

  return (
    <div className="design-fixture-inspector flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line pb-1">
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
        <div className="flex w-14 shrink-0 flex-col items-center gap-0.5">
          <span className="text-[11px] font-medium uppercase text-dim">Dimmer</span>
          <div className="fader">
            <div className="fader-fill" style={{ height: `${(dimmer / 255) * 100}%` }} />
            <input
              type="range"
              min={0}
              max={255}
              value={dimmer}
              disabled={!canEdit || !dimmerSupported}
              aria-label="Dimmer for selected fixtures"
              onChange={(event) => updateValues({ intensity: Number(event.target.value) })}
              className="fader-input"
            />
          </div>
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

        <div className="flex h-full min-w-0 flex-1 gap-1 overflow-hidden">
          {channelAttributes.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[10px] text-dim">
              {selectedFixtures.length > 0 ? 'No additional common channels' : 'Select fixtures in the preview to access controls'}
            </div>
          ) : (
            channelAttributes.map((attribute) => {
              const value = activeCue ? valueFor(attribute) : 0
              return (
                <div key={attribute} className="chan h-full min-w-7 flex-1">
                  <span className="text-center text-[10px] leading-none text-dim">
                    {attributeLabel(attribute)}
                  </span>
                  <div className="chan-track">
                    <div className="chan-fill" style={{ height: `${(value / 255) * 100}%` }} />
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={value}
                      disabled={!canEdit}
                      aria-label={`${attributeLabel(attribute)} for selected fixtures`}
                      onChange={(event) =>
                        updateValues({ [attribute]: Number(event.target.value) })
                      }
                      className="chan-input"
                    />
                  </div>
                  <span className="text-center font-mono text-[11px] leading-none text-zinc-400">
                    {value}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Fanning spreads values across fixtures in a cue; it has no
          meaning while editing a preset's stored values. */}
      {!editingPreset && <div className="shrink-0">
        <FanningEditor />
      </div>}
    </div>
  )
}
