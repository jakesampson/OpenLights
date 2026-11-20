import { ProfileSlotEditor } from './ProfileSlotEditor'
import { useRef, useState } from 'react'
import { BUILTIN_PROFILES } from '@shared/fixtureProfiles'
import { duplicateProfileAsCustom } from '@shared/oflFixtureFormat'
import { exportProfile, importProfile } from '@shared/profileValidation'
import type { FixtureChannel, FixtureProfile } from '@shared/types'
import { useShowStore } from '../stores/showStore'
export function FixtureProfileEditor({ profiles, initialProfileId, createCustom, duplicateFromId, onSaved }: { profiles?: FixtureProfile[]; initialProfileId?: string; createCustom?: boolean; duplicateFromId?: string; onSaved?: (profile: FixtureProfile) => void }) {
  const { show, saveFixtureProfile, deleteFixtureProfile } = useShowStore()
  // First entry wins per id, so a project copy saved from a bundled (OFL)
  // profile shadows the bundled original instead of listing it twice.
  const library = [...new Map((profiles ?? [...BUILTIN_PROFILES, ...(show?.fixtureProfiles ?? [])]).map((p) => [p.id, p])).values()]
  // Build Your Own Fixture (Jake, 20 Nov 2026): start from a blank
  // custom fixture — one dimmer channel — instead of an existing
  // profile. Saving stores it in the show, tagged custom. The brand
  // starts empty: the category is always User Fixtures, whatever brand
  // the user types in (Jake, 20 Nov 2026) — a 'User' manufacturer used
  // to mint a second "User" brand in the patch dialog's brands column.
  const blankCustomProfile = (): FixtureProfile => ({
    id: crypto.randomUUID(),
    name: 'New Fixture',
    manufacturer: '',
    legacyType: 'par',
    custom: true,
    modes: [{ id: 'default', name: 'Default', channels: [{ number: 0, attribute: 'intensity', propertyType: 'intensity', min: 0, max: 255, defaultValue: 0, highlightValue: 255 }] }]
  })
  // New Fixture → Duplicate existing (Jake, 20 Nov 2026; LightKey Guide
  // p.252 — "duplicate a fixture profile and use it as a starting point
  // for new profiles"): the draft is a copy of the chosen profile with
  // ALL its channels carried across, a fresh custom id and " copy" on
  // the name, ready to edit (add or change channels, rename) before
  // saving. Saving stores it in the show, tagged custom.
  const [draft, setDraft] = useState<FixtureProfile>(() => duplicateFromId ? duplicateProfileAsCustom(library.find((p) => p.id === duplicateFromId) ?? BUILTIN_PROFILES[0]) : createCustom ? blankCustomProfile() : structuredClone(library.find((p) => p.id === initialProfileId) ?? BUILTIN_PROFILES[0]))
  const [modeIndex, setModeIndex] = useState(0)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const builtin = BUILTIN_PROFILES.some((p) => p.id === draft.id), mode = draft.modes[modeIndex] ?? draft.modes[0]
  // Only a profile stored in this show can be deleted; a bundled profile
  // is never removed from the library (saving stores an edited copy).
  const projectProfile = (show?.fixtureProfiles ?? []).some((p) => p.id === draft.id)
  const patchMode = (patch: Partial<FixtureProfile['modes'][number]>) => setDraft({ ...draft, modes: draft.modes.map((m, i) => i === modeIndex ? { ...m, ...patch } : m) })
  const patchChannel = (index: number, patch: Partial<FixtureChannel>) => patchMode({ channels: mode.channels.map((c, i) => i === index ? { ...c, ...patch } : c) })
  // The form renders directly, expanded — the editor opens inside its own
  // popup, so there is no collapsed disclosure to open first (Jake,
  // 20 Nov 2026).
  return <div className="rounded border border-line bg-panel p-3 text-xs"><div className="flex flex-wrap gap-2"><select aria-label="Profile to edit" value={draft.id} onChange={(e) => { const p = library.find((p) => p.id === e.target.value); if (p) { setDraft(structuredClone(p)); setModeIndex(0); setError('') } }} className="rounded bg-panel2 p-2">{library.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}{!library.some((p) => p.id === draft.id) && <option value={draft.id}>{draft.name} (unsaved)</option>}</select><button className="btn-theme" onClick={() => { setDraft({ ...structuredClone(draft), id: crypto.randomUUID(), name: `${draft.name} copy` }); setError('') }}>Duplicate / new</button><button className="btn-theme" onClick={() => fileInput.current?.click()}>Import JSON / OFL</button><button className="btn-theme" onClick={() => { try { const url = URL.createObjectURL(new Blob([exportProfile(draft)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${draft.name.replace(/[^a-z0-9-_]/gi, '_')}.json`; a.click(); URL.revokeObjectURL(url) } catch (e) { setError(String(e)) } }}>Export JSON</button><input type="file" ref={fileInput} accept="application/json,.json" className="hidden" aria-label="Import fixture profile file" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const p = importProfile(await file.text(), { sourceName: file.name }); saveFixtureProfile(p); setDraft(p); setModeIndex(0); setError('') } catch (e) { setError(String(e)) } }} /></div>
    {builtin && <p className="mt-2 text-dim">Duplicate a built-in profile to create an editable project profile.</p>}{!builtin && !projectProfile && <p className="mt-2 text-dim">Saving stores an edited copy in this show; the bundled profile is unchanged.</p>}{error && <p role="alert" className="mt-2 text-red-300">{error}</p>}
    <fieldset disabled={builtin} className="mt-3 flex flex-col gap-2"><div className="flex flex-wrap gap-2"><label>Name<input aria-label="Profile name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="ml-1 rounded bg-panel2 p-1" /></label><label>Manufacturer<input aria-label="Profile manufacturer" value={draft.manufacturer} placeholder="Brand (optional)" onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} className="ml-1 rounded bg-panel2 p-1" /></label><select aria-label="Profile mode" value={modeIndex} onChange={(e) => setModeIndex(Number(e.target.value))} className="rounded bg-panel2 p-1">{draft.modes.map((m, i) => <option key={m.id} value={i}>{m.name}</option>)}</select><button className="btn-theme" onClick={() => { setDraft({ ...draft, modes: [...draft.modes, { id: crypto.randomUUID(), name: `Mode ${draft.modes.length + 1}`, channels: structuredClone(mode.channels) }] }); setModeIndex(draft.modes.length) }}>Add mode</button><label>Mode name<input value={mode.name} onChange={(e) => patchMode({ name: e.target.value })} className="ml-1 rounded bg-panel2 p-1" /></label></div>
    <div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{['Channel', 'Property', 'Type', 'Min', 'Max', 'Default', 'Highlight', ''].map((t, i) => <th key={i} className="p-1">{t}</th>)}</tr></thead><tbody>{mode.channels.map((c, index) => <tr key={index}>{(['number', 'attribute', 'propertyType', 'min', 'max', 'defaultValue', 'highlightValue'] as const).map((key) => <td key={key} className="p-1">{key === 'propertyType' ? <select aria-label={`Channel ${index + 1} type`} value={c[key]} onChange={(e) => patchChannel(index, { propertyType: e.target.value as FixtureChannel['propertyType'] })} className="rounded bg-panel2 p-1">{['intensity', 'color', 'position', 'other'].map((t) => <option key={t}>{t}</option>)}</select> : <input aria-label={`Channel ${index + 1} ${key}`} type={key === 'attribute' ? 'text' : 'number'} value={key === 'number' ? c.number + 1 : c[key]} onChange={(e) => patchChannel(index, { [key]: key === 'attribute' ? e.target.value : Number(e.target.value) - (key === 'number' ? 1 : 0) })} className={`${key === 'attribute' ? 'w-28' : 'w-16'} rounded bg-panel2 p-1`} />}</td>)}<td><button className="text-red-300" onClick={() => patchMode({ channels: mode.channels.filter((_, i) => i !== index) })}>Remove</button></td></tr>)}</tbody></table></div>
    <ProfileSlotEditor channels={mode.channels} patch={patchChannel} />
    <div className="flex gap-2"><button className="btn-theme" onClick={() => patchMode({ channels: [...mode.channels, { number: Math.max(-1, ...mode.channels.map((c) => c.number)) + 1, attribute: `custom${mode.channels.length + 1}`, propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0 }] })}>Add channel</button><button className="btn-theme on" onClick={() => { try { saveFixtureProfile(draft); setError(''); onSaved?.({ ...draft, custom: true }) } catch (e) { setError(String(e)) } }}>Save profile</button><button className="btn-theme" disabled={!projectProfile} title={projectProfile ? undefined : 'Only a profile stored in this show can be deleted'} onClick={() => { deleteFixtureProfile(draft.id); setDraft(structuredClone(BUILTIN_PROFILES[0])); setModeIndex(0) }}>Delete profile</button></div></fieldset>
  </div>
}
