import { fixtureMode } from '@shared/fixtureProfiles'
import { availableProperties } from '../lib/availableProperties'
import { fixtureAttributes } from '../lib/automationRuntime'
import { colorWheelPosition } from '../lib/colorWheel'
import { useShowStore } from '../stores/showStore'

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
    scenes,
    activeSceneId,
    selectedFixtureIds,
    selectedBeams,
    updateSelectedBeamValues,
    updateSelectedFixtures,
    setSelectedColor,
  } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  const selectedFixtures = fixtures.filter((fixture) => selectedFixtureIds.includes(fixture.id))
  const beamProperties = selectedBeams.map((b) => { const f = fixtures.find((f) => f.id === b.fixtureId); return f && fixtureMode(f)?.beams?.find((beam) => beam.id === b.beamId)?.properties }).filter((b): b is Record<string, string> => Boolean(b))
  const commonAttributes = beamProperties.length ? Object.keys(beamProperties[0]).filter((key) => beamProperties.every((b) => key in b)) : availableProperties(selectedFixtures).map((property) => property.attribute)
  const channelAttributes = selectedFixtures.length
    ? commonAttributes.filter((attribute) => attribute !== 'intensity')
    : []
  const canEdit = Boolean(show && selectedFixtures.length > 0)
  const dimmerSupported = commonAttributes.includes('intensity')
  const previewOnlyColor = selectedFixtures.length > 0 && selectedFixtures.every((fixture) => fixture.type === 'dimmer')
  const valueFor = (attribute: string) => selectedBeams.length ? Math.round(selectedBeams.reduce((sum, b) => { const f = fixtures.find((f) => f.id === b.fixtureId), key = f && fixtureMode(f)?.beams?.find((beam) => beam.id === b.beamId)?.properties[attribute]; return sum + (key ? activeScene?.fixtureValues[b.fixtureId]?.[key] ?? 0 : 0) }, 0) / selectedBeams.length) :
    selectedFixtures.length > 0
      ? Math.round(
          selectedFixtures.reduce(
            (total, fixture) => total + (activeScene?.fixtureValues[fixture.id]?.[attribute] ?? (fixture.type === 'dimmer' && ['red', 'green', 'blue'].includes(attribute) ? 255 : 0)),
            0
          ) / selectedFixtures.length
        )
      : 0
  const dimmer = activeScene ? valueFor('intensity') : 0
  const updateValues = selectedBeams.length ? (values: Record<string, number>) => updateSelectedBeamValues(values, false) : updateSelectedFixtures
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
    if (selectedBeams.length) updateSelectedBeamValues(rgb, false)
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
        {!activeScene && selectedFixtures.length > 0 && <span className="text-[10px] text-dim">Select a scene in the right sidebar to edit its fixture values</span>}
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

        <div className="flex h-full min-w-0 flex-1 gap-1 overflow-hidden">
          {channelAttributes.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[10px] text-dim">
              {selectedFixtures.length > 0 ? 'No additional common channels' : 'Select fixtures in the preview to access controls'}
            </div>
          ) : (
            channelAttributes.map((attribute) => {
              const value = activeScene ? valueFor(attribute) : 0
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


    </div>
  )
}
