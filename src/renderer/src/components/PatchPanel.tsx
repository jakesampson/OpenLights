import { useState } from 'react'
import { nextFreeChannel, useShowStore } from '../stores/showStore'
import { FixtureProfileEditor } from './FixtureProfileEditor'
import { DmxMonitor } from './DmxMonitor'
import { FIXTURE_PRESETS } from '@shared/types'
import { BUILTIN_PROFILES } from '@shared/fixtureProfiles'
import { filterProfiles } from '../lib/filterProfiles'
import { findConflicts } from '../lib/patch'
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
  const library = [...BUILTIN_PROFILES, ...(show?.fixtureProfiles ?? [])]
  const fixtures = show?.fixtures ?? []
  const conflicts = findConflicts(fixtures)
  const conflictingIds = new Set(conflicts.flatMap((c) => c.fixtureIds))
  const [presetId, setPresetId] = useState(FIXTURE_PRESETS[0].id)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [startAddress, setStartAddress] = useState(1)
  const [modeId, setModeId] = useState('default')
  const [patchError, setPatchError] = useState('')
  const [query, setQuery] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [channelCount, setChannelCount] = useState(0)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const profiles = filterProfiles(library, { query, manufacturer, channels: channelCount, favoritesOnly }, show?.favoriteProfileIds)
  const filteredPresets = profiles.map((profile) => ({ id: profile.id, name: profile.name, type: profile.legacyType, channels: Math.max(...profile.modes[0].channels.map((c) => c.number)) + 1 }))
  const selectedPreset = filteredPresets.find((p) => p.id === presetId) ?? filteredPresets[0]

  const handleAdd = () => {
    const preset = selectedPreset
    if (!preset) return
    const profile = library.find((p) => p.id === preset.id)
    if (!profile) return
    try { useShowStore.getState().addProfileFixtures(profile, { quantity, start: startAddress, name, group, modeId, universe: 1 }); setName(''); setPatchError('') } catch (error) { setPatchError(error instanceof Error ? error.message : String(error)) }
  }

  const usedChannels = fixtures.reduce((count, f) => count + f.channels, 0)
  const lastChannel = fixtures.reduce(
    (max, f) => Math.max(max, f.channelStart - 1 + f.channels),
    0
  )

  return (
    <section className="flex flex-col gap-4">
      <FixtureProfileEditor />
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
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><input aria-label="Search fixture library" placeholder="Search fixture library" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded bg-panel2 p-2" /><select aria-label="Fixture manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="rounded bg-panel2 p-2"><option value="">All manufacturers</option>{[...new Set(library.map((p) => p.manufacturer))].map((name) => <option key={name}>{name}</option>)}</select><input aria-label="Fixture channel count filter" type="number" min="0" max="512" value={channelCount || ''} placeholder="Channels" onChange={(e) => setChannelCount(Number(e.target.value))} className="w-24 rounded bg-panel2 p-2" /><label><input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} /> Favourites</label><button type="button" className="btn-theme" disabled={!selectedPreset} onClick={() => { if (!selectedPreset) return; const ids = show?.favoriteProfileIds ?? []; useShowStore.getState().updateProject({ favoriteProfileIds: ids.includes(selectedPreset.id) ? ids.filter((id) => id !== selectedPreset.id) : [...ids, selectedPreset.id] }) }}>{show?.favoriteProfileIds?.includes(selectedPreset?.id ?? '') ? 'Unfavourite selected' : 'Favourite selected'}</button></div>
        {patchError && <p role="alert" className="mb-2 text-xs text-red-300">{patchError}</p>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">Mode<select aria-label="Fixture mode" value={modeId} onChange={(e) => setModeId(e.target.value)} className="block rounded bg-panel2 p-2">{library.find((p) => p.id === selectedPreset?.id)?.modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="text-xs">Quantity<input aria-label="Fixture quantity" type="number" min="1" max="512" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="block w-20 rounded bg-panel2 p-2" /></label><label className="text-xs">Start address<input aria-label="Fixture start address" type="number" min="1" max="512" value={startAddress} onChange={(e) => setStartAddress(Number(e.target.value))} className="block w-20 rounded bg-panel2 p-2" /></label><label className="text-xs">Universe<select aria-label="Fixture universe" className="block rounded bg-panel2 p-2" value="1" disabled><option value="1">1 · USB DMX</option></select></label>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500">Preset</label>
            <select
              value={selectedPreset?.id ?? ''}
              onChange={(e) => setPresetId(e.target.value)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white"
            >
              {filteredPresets.map((p) => (
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
                <tr key={fixture.id} className={conflictingIds.has(fixture.id) ? 'bg-red-900/30' : 'hover:bg-zinc-800/30'} title={conflicts.filter((c) => c.fixtureIds.includes(fixture.id)).map((c) => c.type === 'overlap' ? `Overlapping channels: ${c.channels.join(', ')}` : 'Address exceeds the supported DMX range').join('; ')}>
                  <td className="px-4 py-2"><label className="mr-1 text-[10px]"><input type="checkbox" aria-label={`Enable ${fixture.name}`} checked={!fixture.disabled} onChange={(e) => updateFixture(fixture.id, { disabled: !e.target.checked })} /> On</label>
                    {conflictingIds.has(fixture.id) && <span className="mr-1 text-[10px] text-red-300">Address warning</span>}
                    <input
                      value={fixture.name}
                      onChange={(e) => updateFixture(fixture.id, { name: e.target.value })}
                      className="w-40 rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={fixture.profileId ?? library.find((p) => p.legacyType === fixture.type)?.id ?? ''}
                      onChange={(e) => { const profile = library.find((p) => p.id === e.target.value); if (profile) { try { useShowStore.getState().reassignFixtureProfile(fixture.id, profile) } catch (error) { setPatchError(error instanceof Error ? error.message : String(error)) } } }}
                      className="rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                    >
                      {library.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2"><input aria-label={`Notes for ${fixture.name}`} value={fixture.notes ?? ''} onChange={(e) => updateFixture(fixture.id, { notes: e.target.value })} placeholder="Notes" className="mb-1 w-28 rounded bg-panel2 p-1" />
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
                    <button className="mr-2 text-[10px] text-dim" onClick={() => { try { useShowStore.getState().duplicateFixture(fixture.id) } catch (error) { setPatchError(error instanceof Error ? error.message : String(error)) } }}>Duplicate</button><span className="mr-2 text-[10px] text-dim">U{fixture.universe ?? 1}</span>
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
