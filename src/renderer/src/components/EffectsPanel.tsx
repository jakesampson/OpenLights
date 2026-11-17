import { useMemo, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { fixtureAttributes } from '../lib/automationRuntime'
import { waveformValue } from '../lib/effects'
import type { EffectDef, EffectWaveform } from '@shared/types'

const WAVEFORMS: EffectWaveform[] = ['sine', 'triangle', 'square', 'saw', 'random']
const DIMMER_ATTRS = new Set(['intensity', 'red', 'green', 'blue', 'white', 'amber', 'uv'])

function summary(effect: EffectDef, fixtureNames: Map<string, string>): string {
  const targets =
    effect.fixtureIds.length === 0
      ? 'All fixtures'
      : effect.fixtureIds.map((id) => fixtureNames.get(id) ?? 'Fixture').join(', ')
  return `${targets} · ${effect.attribute} · ${effect.syncToBpm ? `${effect.speed}× beat` : `${effect.speed.toFixed(2)} Hz`}`
}

function WavePreview({ effect }: { effect: EffectDef }) {
  const points = useMemo(() => {
    const samples = 64
    const cycles = 2
    return Array.from({ length: samples }, (_, i) => {
      const phase = (i / (samples - 1)) * cycles
      const value = waveformValue(effect.waveform, phase, 0)
      const x = (i / (samples - 1)) * 100
      const y = 18 - ((value * 0.5 + 0.5) * 16)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ')
  }, [effect.waveform])

  return (
    <svg viewBox="0 0 100 20" className="h-5 w-24 text-indigo-400" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

export function EffectsPanel() {
  const { show, effects, addEffect, updateEffect, removeEffect, bpm } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const fixtureNames = useMemo(
    () => new Map(fixtures.map((fixture) => [fixture.id, fixture.name])),
    [fixtures]
  )
  const attributes = useMemo(() => {
    const set = new Set<string>()
    for (const fixture of fixtures) {
      for (const attr of fixtureAttributes(fixture)) set.add(attr)
    }
    return [...set]
  }, [fixtures])

  const [attribute, setAttribute] = useState('intensity')
  const [waveform, setWaveform] = useState<EffectWaveform>('sine')
  const [syncToBpm, setSyncToBpm] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [size, setSize] = useState(128)
  const [offset, setOffset] = useState(128)
  const [phaseSpread, setPhaseSpread] = useState(120)
  const [selectedFixtures, setSelectedFixtures] = useState<string[]>([])

  const add = () => {
    const effect: EffectDef = {
      id: crypto.randomUUID(),
      name: `${waveform} ${attribute}`,
      fixtureIds: selectedFixtures,
      attribute: attributes.includes(attribute) ? attribute : (attributes[0] ?? 'intensity'),
      waveform,
      speed,
      syncToBpm,
      size,
      offset,
      phaseSpread,
      enabled: true
    }
    addEffect(effect)
  }

  const toggleFixture = (id: string) =>
    setSelectedFixtures((current) =>
      current.includes(id) ? current.filter((f) => f !== id) : [...current, id]
    )

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Effects</h2>
        <span className="text-[10px] text-zinc-500">
          {effects.filter((e) => e.enabled).length} running · {Math.round(bpm)} BPM
        </span>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Add Effect
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Attribute</span>
            <select
              value={attribute}
              onChange={(e) => setAttribute(e.target.value)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white"
            >
              {attributes.map((attr) => (
                <option key={attr} value={attr}>
                  {attr}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Waveform</span>
            <select
              value={waveform}
              onChange={(e) => setWaveform(e.target.value as EffectWaveform)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white"
            >
              {WAVEFORMS.map((wave) => (
                <option key={wave} value={wave}>
                  {wave}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Speed</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-20 rounded bg-zinc-800 px-2 py-1.5 text-center text-xs text-white"
            />
          </label>
          <label className="flex items-center gap-2 pb-1 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={syncToBpm}
              onChange={(e) => setSyncToBpm(e.target.checked)}
            />
            Sync to BPM
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Size</span>
            <input
              type="range"
              min={0}
              max={255}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-32 accent-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Offset</span>
            <input
              type="range"
              min={0}
              max={255}
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              className="w-32 accent-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Fan-out°</span>
            <input
              type="number"
              min={0}
              max={360}
              step={15}
              value={phaseSpread}
              onChange={(e) => setPhaseSpread(Number(e.target.value))}
              className="w-20 rounded bg-zinc-800 px-2 py-1.5 text-center text-xs text-white"
            />
          </label>
          <button
            onClick={add}
            disabled={fixtures.length === 0}
            className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            + Add Effect
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Targets</span>
          <button
            onClick={() => setSelectedFixtures([])}
            className={`rounded px-2 py-1 text-[10px] ${
              selectedFixtures.length === 0
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            All fixtures
          </button>
          {fixtures.map((fixture) => {
            const on = selectedFixtures.includes(fixture.id)
            return (
              <button
                key={fixture.id}
                onClick={() => toggleFixture(fixture.id)}
                className={`rounded px-2 py-1 text-[10px] ${
                  on ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {fixture.name}
              </button>
            )
          })}
        </div>
      </div>

      {effects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center text-xs text-zinc-500">
          No effects yet. Add a sine on intensity or a saw on pan/tilt to animate your rig.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {effects.map((effect) => (
            <div
              key={effect.id}
              className={`rounded-xl border bg-zinc-900 p-4 ${
                effect.enabled ? 'border-zinc-700' : 'border-zinc-800 opacity-70'
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={effect.enabled}
                    onChange={(e) => updateEffect(effect.id, { enabled: e.target.checked })}
                  />
                  <span className="text-xs font-semibold text-zinc-200">Live</span>
                </label>
                <input
                  value={effect.name}
                  onChange={(e) => updateEffect(effect.id, { name: e.target.value })}
                  className="w-40 rounded bg-zinc-800 px-3 py-1.5 text-xs text-white"
                />
                <WavePreview effect={effect} />
                <span className="text-[10px] text-zinc-500">{summary(effect, fixtureNames)}</span>
                <button
                  onClick={() => removeEffect(effect.id)}
                  className="ml-auto text-[10px] text-zinc-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500">Waveform</span>
                  <select
                    value={effect.waveform}
                    onChange={(e) =>
                      updateEffect(effect.id, { waveform: e.target.value as EffectWaveform })
                    }
                    className="rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                  >
                    {WAVEFORMS.map((wave) => (
                      <option key={wave} value={wave}>
                        {wave}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500">Attribute</span>
                  <select
                    value={effect.attribute}
                    onChange={(e) => updateEffect(effect.id, { attribute: e.target.value })}
                    className="rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                  >
                    {attributes.map((attr) => (
                      <option key={attr} value={attr}>
                        {attr}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500">Speed</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={effect.speed}
                    onChange={(e) => updateEffect(effect.id, { speed: Number(e.target.value) })}
                    className="w-20 rounded bg-zinc-800 px-2 py-1 text-center text-xs text-white"
                  />
                </label>
                <label className="flex items-center gap-2 pb-1 text-[10px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={effect.syncToBpm}
                    onChange={(e) => updateEffect(effect.id, { syncToBpm: e.target.checked })}
                  />
                  BPM
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500">
                    Size <span className="font-mono text-zinc-400">{effect.size}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={effect.size}
                    onChange={(e) => updateEffect(effect.id, { size: Number(e.target.value) })}
                    className="w-32 accent-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500">
                    Offset <span className="font-mono text-zinc-400">{effect.offset}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={effect.offset}
                    onChange={(e) => updateEffect(effect.id, { offset: Number(e.target.value) })}
                    className="w-32 accent-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500">Fan-out°</span>
                  <input
                    type="number"
                    min={0}
                    max={360}
                    step={15}
                    value={effect.phaseSpread}
                    onChange={(e) =>
                      updateEffect(effect.id, { phaseSpread: Number(e.target.value) })
                    }
                    className="w-20 rounded bg-zinc-800 px-2 py-1 text-center text-xs text-white"
                  />
                </label>
                {DIMMER_ATTRS.has(effect.attribute) && (
                  <span className="pb-1 text-[10px] text-zinc-600">master-scaled</span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[9px] uppercase tracking-wider text-zinc-600">Targets</span>
                <button
                  onClick={() => updateEffect(effect.id, { fixtureIds: [] })}
                  className={`rounded px-2 py-0.5 text-[9px] ${
                    effect.fixtureIds.length === 0
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  All
                </button>
                {fixtures.map((fixture) => {
                  const on = effect.fixtureIds.includes(fixture.id)
                  return (
                    <button
                      key={fixture.id}
                      onClick={() => {
                        const next = on
                          ? effect.fixtureIds.filter((id) => id !== fixture.id)
                          : [...effect.fixtureIds, fixture.id]
                        updateEffect(effect.id, { fixtureIds: next })
                      }}
                      className={`rounded px-2 py-0.5 text-[9px] ${
                        on ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {fixture.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
