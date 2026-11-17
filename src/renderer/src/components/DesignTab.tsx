import { fixtureAttributes } from '../lib/automationRuntime'
import { useShowStore } from '../stores/showStore'

const EMPTY_CHANNELS = ['red', 'green', 'blue', 'white', 'amber', 'uv']

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
    updateSelectedFixtures
  } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  const selectedFixtures = fixtures.filter((fixture) => selectedFixtureIds.includes(fixture.id))
  const commonAttributes =
    selectedFixtures.length > 0
      ? fixtureAttributes(selectedFixtures[0].type).filter((attribute) =>
          selectedFixtures.every((fixture) => fixtureAttributes(fixture.type).includes(attribute))
        )
      : []
  const channelAttributes = selectedFixtures.length
    ? commonAttributes.filter((attribute) => attribute !== 'intensity')
    : EMPTY_CHANNELS
  const canEdit = Boolean(activeScene && selectedFixtures.length > 0)
  const dimmerSupported = commonAttributes.includes('intensity')
  const valueFor = (attribute: string) =>
    selectedFixtures.length > 0
      ? Math.round(
          selectedFixtures.reduce(
            (total, fixture) => total + (activeScene?.fixtureValues[fixture.id]?.[attribute] ?? 0),
            0
          ) / selectedFixtures.length
        )
      : 0
  const dimmer = canEdit ? valueFor('intensity') : 0
  const colorValues = {
    red: valueFor('red'),
    green: valueFor('green'),
    blue: valueFor('blue')
  }
  const colorSupported = ['red', 'green', 'blue'].every((attribute) =>
    commonAttributes.includes(attribute)
  )

  const setColor = (hex: string) => {
    updateSelectedFixtures({
      red: parseInt(hex.slice(1, 3), 16),
      green: parseInt(hex.slice(3, 5), 16),
      blue: parseInt(hex.slice(5, 7), 16)
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2 text-[10px] text-dim">
        <span>
          {selectedFixtures.length > 0
            ? `${selectedFixtures.length} fixture${selectedFixtures.length === 1 ? '' : 's'} selected`
            : 'Select fixture(s) on stage'}
        </span>
        {selectedFixtures.length > 0 && !activeScene && <span>Select a scene to edit values</span>}
      </div>

      <div className="flex min-h-[140px] flex-1 items-stretch gap-3">
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
              onChange={(event) => updateSelectedFixtures({ intensity: Number(event.target.value) })}
              className="fader-input"
            />
          </div>
          <span className="font-mono text-[12px] text-white">
            {dimmerSupported ? `${Math.round((dimmer / 255) * 100)}%` : '—'}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="text-[11px] font-medium uppercase text-dim">Colour</span>
          <div className="wheel relative" style={{ width: 84, height: 84 }}>
            <input
              type="color"
              value={colorHex(colorValues)}
              disabled={!canEdit || !colorSupported}
              aria-label="Colour for selected fixtures"
              onChange={(event) => setColor(event.target.value)}
              className="wheel-input"
            />
          </div>
          <span className="font-mono text-[10px] text-dim">
            {colorSupported && selectedFixtures.length > 0
              ? `RGB ${colorValues.red}·${colorValues.green}·${colorValues.blue}`
              : 'RGB —'}
          </span>
        </div>

        <div className="flex h-full min-w-0 flex-1 gap-1 overflow-x-auto">
          {channelAttributes.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[10px] text-dim">
              No common channels
            </div>
          ) : (
            channelAttributes.map((attribute) => {
              const value = canEdit ? valueFor(attribute) : 0
              return (
                <div key={attribute} className="chan h-full w-9 shrink-0">
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
                        updateSelectedFixtures({ [attribute]: Number(event.target.value) })
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

      <div className="flex shrink-0 flex-wrap gap-4 border-t border-line pt-1.5">
        <div className="flex shrink-0 items-center gap-1.5">
          <label className="whitespace-nowrap text-[10px] font-medium uppercase text-dim">
            Shutter / Strobe
          </label>
          <div className="flex gap-1">
            <button className="btn-theme on px-2 text-[10px]">Open</button>
            <button className="btn-theme px-2 text-[10px]">Closed</button>
            <button className="btn-theme px-2 text-[10px]" disabled title="Not implemented">
              Strobe
            </button>
            <button className="btn-theme px-2 text-[10px]" disabled title="Not implemented">
              Pulse
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <label className="whitespace-nowrap text-[10px] font-medium uppercase text-dim">
            Movement Speed
          </label>
          <div className="flex gap-1">
            <button className="btn-theme on px-2 text-[10px]">Tracking</button>
            <button className="btn-theme px-2 text-[10px]" disabled title="Not implemented">
              Vector
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
