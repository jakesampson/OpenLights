import { useState } from 'react'
import { nextFreeChannel, useShowStore } from '../stores/showStore'
import { DmxMonitor } from './DmxMonitor'
import { FIXTURE_PRESETS } from '@shared/types'
import type { FixtureType } from '@shared/types'

const TYPE_LABELS: Record<FixtureType, string> = {
  par: 'PAR',
  'led-wash': 'LED wash',
  'moving-head': 'Moving head',
  dimmer: 'Dimmer',
  'generic-led': 'Generic LED',
  'pixel-bar-17ch': 'PAN 4x1x30 (17ch)',
  'rgba-4ch': 'RGBA PAR (4ch)',
  'rgbw-4ch': 'RGBW PAR (4ch)'
}

export function PatchPanel() {
  const { show, addFixture, updateFixture, removeFixture } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const [presetId, setPresetId] = useState(FIXTURE_PRESETS[0].id)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')

  const handleAdd = () => {
    const preset = FIXTURE_PRESETS.find((p) => p.id === presetId) ?? FIXTURE_PRESETS[0]
    addFixture(preset, name, group)
    setName('')
  }

  const usedChannels = fixtures.reduce((count, f) => count + f.channels, 0)
  const lastChannel = fixtures.reduce(
    (max, f) => Math.max(max, f.channelStart - 1 + f.channels),
    0
  )

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
          Fixture Patch
        </h2>
        <span className="text-[10px] text-zinc-500">
          {fixtures.length} fixtures · {usedChannels} channels · universe ends at {lastChannel}
        </span>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Add Fixture
        </h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500">Preset</label>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white"
            >
              {FIXTURE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.channels}ch
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="w-44 rounded bg-zinc-800 px-3 py-1.5 text-xs text-white placeholder-zinc-600"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500">Group</label>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Ungrouped"
              className="w-32 rounded bg-zinc-800 px-3 py-1.5 text-xs text-white placeholder-zinc-600"
            />
          </div>
          <button
            onClick={handleAdd}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Add Fixture
          </button>
          <span className="text-[10px] text-zinc-500">
            next free address: {nextFreeChannel(fixtures)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
        {fixtures.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500">
            No fixtures patched yet. Add one above to start building scenes.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/60 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Group</th>
                <th className="px-2 py-2 font-medium">Start ch</th>
                <th className="px-2 py-2 font-medium">Channels</th>
                <th className="px-2 py-2 font-medium">Range</th>
                <th className="px-2 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {fixtures.map((fixture) => (
                <tr key={fixture.id} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-2">
                    <input
                      value={fixture.name}
                      onChange={(e) => updateFixture(fixture.id, { name: e.target.value })}
                      className="w-40 rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={fixture.type}
                      onChange={(e) => {
                        const preset = FIXTURE_PRESETS.find((p) => p.type === e.target.value)
                        updateFixture(fixture.id, {
                          type: e.target.value as FixtureType,
                          channels: preset?.channels ?? fixture.channels
                        })
                      }}
                      className="rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                    >
                      {(Object.keys(TYPE_LABELS) as FixtureType[]).map((type) => (
                        <option key={type} value={type}>
                          {TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={fixture.group ?? ''}
                      onChange={(e) => updateFixture(fixture.id, { group: e.target.value })}
                      className="w-28 rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      max={512}
                      value={fixture.channelStart}
                      onChange={(e) =>
                        updateFixture(fixture.id, { channelStart: Number(e.target.value) })
                      }
                      className="w-16 rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={fixture.channels}
                      onChange={(e) => updateFixture(fixture.id, { channels: Number(e.target.value) })}
                      className="w-14 rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2 font-mono text-[10px] text-zinc-500">
                    {fixture.channelStart}–{fixture.channelStart - 1 + fixture.channels}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${fixture.name}? Scene values for it are removed too.`)) {
                          removeFixture(fixture.id)
                        }
                      }}
                      className="text-[10px] text-zinc-500 hover:text-red-400"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {fixtures.some((f) => f.channelStart + f.channels - 1 > 512) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          One or more fixtures extend past DMX channel 512.
        </div>
      )}

      <DmxMonitor />
    </section>
  )
}
