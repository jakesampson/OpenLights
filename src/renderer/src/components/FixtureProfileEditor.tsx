import { ProfileSlotEditor } from './ProfileSlotEditor'
import { useRef, useState } from 'react'
import { BUILTIN_PROFILES } from '@shared/fixtureProfiles'
import { duplicateProfileAsCustom, asNewCustom } from '@shared/oflFixtureFormat'
import { exportProfile, importProfile } from '@shared/profileValidation'
import type { FixtureChannel, FixtureProfile } from '@shared/types'
import { useShowStore } from '../stores/showStore'
export function FixtureProfileEditor({ profiles, initialProfileId, createCustom, duplicateFromId, onSaved }: { profiles?: FixtureProfile[]; initialProfileId?: string; createCustom?: boolean; duplicateFromId?: string; onSaved?: (profile: FixtureProfile) => void }) {
  const { show, oflProfiles, deleteFixtureProfile } = useShowStore()
  // Saving from this editor always goes to the GLOBAL fixture library
  // (Jake, 20 Nov 2026 — all duplicates and Build Your Own fixtures are
  // global, available in every show), never into the current show. A
  // draft whose id belongs to a base library record (built-in or OFL)
  // is an edit of that record, not of the user's own fixture, so it is
  // saved as a NEW custom fixture under a fresh id and the base record
  // is untouched. A custom draft keeps its id, so editing a global
  // custom updates the global record — and fixtures already patched
  // from it pick the edit up when the library lands (the heal refreshes
  // a custom fixture's inline snapshot from the library copy). One
  // home per id: a show-stored copy of the saved fixture is removed
  // first, or it would shadow the fresh global record in this show.
  const saveDraftGlobally = async (draftProfile: FixtureProfile): Promise<FixtureProfile> => {
    const store = useShowStore.getState()
    const collidesWithBase = (id: string) =>
      BUILTIN_PROFILES.some((p) => p.id === id) || store.oflProfiles.some((p) => p.id === id && !p.custom)
    const toSave = collidesWithBase(draftProfile.id) ? asNewCustom(draftProfile) : { ...draftProfile, custom: true }
    const result = await window.electronAPI.saveOflCustomProfile(toSave)
    if (!result.success || !result.profile) throw new Error(result.error ?? 'Could not save the fixture')
    if ((store.show?.fixtureProfiles ?? []).some((p) => p.id === result.profile!.id)) store.deleteFixtureProfile(result.profile.id)
    store.setOflProfiles(Array.isArray(result.profiles) ? result.profiles : store.oflProfiles)
    return result.profile
  }
  // First entry wins per id, so a project copy saved from a bundled (OFL)
  // profile shadows the bundled original instead of listing it twice.
  const library = [...new Map((profiles ?? [...BUILTIN_PROFILES, ...(show?.fixtureProfiles ?? [])]).map((p) => [p.id, p])).values()]
  // Build Your Own Fixture (Jake, 20 Nov 2026): start from a blank
  // custom fixture — one dimmer channel — instead of an existing
  // profile. Saving stores it in the global library, tagged custom.
  // The brand starts empty: the category is always User Fixtures,
  // whatever brand the user types in (Jake, 20 Nov 2026) — a 'User'
  // manufacturer used to mint a second "User" brand in the patch
  // dialog's brands column.
  const blankCustomProfile = (): FixtureProfile => asNewCustom({
    id: 'new-fixture',
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
  // saving. Saving stores it in the global library, tagged custom.
  const [draft, setDraft] = useState<FixtureProfile>(() => duplicateFromId ? duplicateProfileAsCustom(library.find((p) => p.id === duplicateFromId) ?? BUILTIN_PROFILES[0]) : createCustom ? blankCustomProfile() : structuredClone(library.find((p) => p.id === initialProfileId) ?? BUILTIN_PROFILES[0]))
  const [modeIndex, setModeIndex] = useState(0)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const builtin = BUILTIN_PROFILES.some((p) => p.id === draft.id), mode = draft.modes[modeIndex] ?? draft.modes[0]
  // Deleting a fixture removes it from where it lives. A global custom
  // fixture (Jake, 20 Nov 2026 — customs are global) is deleted from
  // the library — unless it is patched in this show, when deleting it
  // would strand those fixtures, so the button says why it is off. A
  // profile stored only in this show (created before customs went
  // global) is deleted from the show instead. A bundled profile is
  // never removed from the library (saving stores an edited copy).
  const projectProfile = (show?.fixtureProfiles ?? []).some((p) => p.id === draft.id)
  const globalProfile = oflProfiles.some((p) => p.id === draft.id && p.custom === true)
  const patchedHere = (show?.fixtures ?? []).some((f) => f.profileId === draft.id)
  const deleteDisabled = globalProfile ? patchedHere : !projectProfile
  const deleteTitle = globalProfile
    ? patchedHere ? 'This fixture is patched in this show — remove those fixtures first' : undefined
    : projectProfile ? undefined : 'Only your own fixture can be deleted'
  const deleteGlobalProfile = async () => {
    const result = await window.electronAPI.deleteOflCustomProfile(draft.id)
    if (!result.success) throw new Error(result.error ?? 'Could not delete the fixture')
    useShowStore.getState().setOflProfiles(Array.isArray(result.profiles) ? result.profiles : oflProfiles)
  }
  const patchMode = (patch: Partial<FixtureProfile['modes'][number]>) => setDraft({ ...draft, modes: draft.modes.map((m, i) => i === modeIndex ? { ...m, ...patch } : m) })
  const patchChannel = (index: number, patch: Partial<FixtureChannel>) => patchMode({ channels: mode.channels.map((c, i) => i === index ? { ...c, ...patch } : c) })
  // The form renders directly, expanded — the editor opens inside its own
  // popup, so there is no collapsed disclosure to open first (Jake,
  // 20 Nov 2026).
  return <div className="rounded border border-line bg-panel p-3 text-xs"><div className="flex flex-wrap gap-2"><select aria-label="Profile to edit" value={draft.id} onChange={(e) => { const p = library.find((p) => p.id === e.target.value); if (p) { setDraft(structuredClone(p)); setModeIndex(0); setError('') } }} className="rounded bg-panel2 p-2">{library.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}{!library.some((p) => p.id === draft.id) && <option value={draft.id}>{draft.name} (unsaved)</option>}</select><button className="btn-theme" onClick={() => { setDraft(duplicateProfileAsCustom(draft)); setError('') }}>Duplicate / new</button><button className="btn-theme" onClick={() => fileInput.current?.click()}>Import JSON / OFL</button><button className="btn-theme" onClick={() => { try { const url = URL.createObjectURL(new Blob([exportProfile(draft)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${draft.name.replace(/[^a-z0-9-_]/gi, '_')}.json`; a.click(); URL.revokeObjectURL(url) } catch (e) { setError(String(e)) } }}>Export JSON</button><input type="file" ref={fileInput} accept="application/json,.json" className="hidden" aria-label="Import fixture profile file" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const p = importProfile(await file.text(), { sourceName: file.name }); const saved = await saveDraftGlobally(p); setDraft(saved); setModeIndex(0); setError(''); onSaved?.(saved) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }} /></div>
    {builtin && <p className="mt-2 text-dim">Duplicate a built-in profile to create an editable project profile.</p>}{!builtin && globalProfile && <p className="mt-2 text-dim">Saving updates this fixture in the global library — every show using it picks up the change.</p>}{!builtin && !globalProfile && !projectProfile && <p className="mt-2 text-dim">Saving stores an edited copy as your own fixture in the global library; the bundled profile is unchanged.</p>}{error && <p role="alert" className="mt-2 text-red-300">{error}</p>}
    <fieldset disabled={builtin} className="mt-3 flex flex-col gap-2"><div className="flex flex-wrap gap-2"><label>Name<input aria-label="Profile name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="ml-1 rounded bg-panel2 p-1" /></label><label>Manufacturer<input aria-label="Profile manufacturer" value={draft.manufacturer} placeholder="Brand (optional)" onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} className="ml-1 rounded bg-panel2 p-1" /></label><select aria-label="Profile mode" value={modeIndex} onChange={(e) => setModeIndex(Number(e.target.value))} className="rounded bg-panel2 p-1">{draft.modes.map((m, i) => <option key={m.id} value={i}>{m.name}</option>)}</select><button className="btn-theme" onClick={() => { setDraft({ ...draft, modes: [...draft.modes, { id: crypto.randomUUID(), name: `Mode ${draft.modes.length + 1}`, channels: structuredClone(mode.channels) }] }); setModeIndex(draft.modes.length) }}>Add mode</button><label>Mode name<input value={mode.name} onChange={(e) => patchMode({ name: e.target.value })} className="ml-1 rounded bg-panel2 p-1" /></label></div>
    <div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{['Channel', 'Property', 'Type', 'Min', 'Max', 'Default', 'Highlight', ''].map((t, i) => <th key={i} className="p-1">{t}</th>)}</tr></thead><tbody>{mode.channels.map((c, index) => <tr key={index}>{(['number', 'attribute', 'propertyType', 'min', 'max', 'defaultValue', 'highlightValue'] as const).map((key) => <td key={key} className="p-1">{key === 'propertyType' ? <select aria-label={`Channel ${index + 1} type`} value={c[key]} onChange={(e) => patchChannel(index, { propertyType: e.target.value as FixtureChannel['propertyType'] })} className="rounded bg-panel2 p-1">{['intensity', 'color', 'position', 'other'].map((t) => <option key={t}>{t}</option>)}</select> : <input aria-label={`Channel ${index + 1} ${key}`} type={key === 'attribute' ? 'text' : 'number'} value={key === 'number' ? c.number + 1 : c[key]} onChange={(e) => patchChannel(index, { [key]: key === 'attribute' ? e.target.value : Number(e.target.value) - (key === 'number' ? 1 : 0) })} className={`${key === 'attribute' ? 'w-28' : 'w-16'} rounded bg-panel2 p-1`} />}</td>)}<td><button className="text-red-300" onClick={() => patchMode({ channels: mode.channels.filter((_, i) => i !== index) })}>Remove</button></td></tr>)}</tbody></table></div>
    <ProfileSlotEditor channels={mode.channels} patch={patchChannel} />
    <div className="flex gap-2"><button className="btn-theme" onClick={() => patchMode({ channels: [...mode.channels, { number: Math.max(-1, ...mode.channels.map((c) => c.number)) + 1, attribute: `custom${mode.channels.length + 1}`, propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0 }] })}>Add channel</button><button className="btn-theme on" onClick={() => { void (async () => { try { const saved = await saveDraftGlobally(draft); setDraft(saved); setModeIndex(0); setError(''); onSaved?.(saved) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } })() }}>Save profile</button><button className="btn-theme" disabled={deleteDisabled} title={deleteTitle} onClick={() => { void (async () => { try { if (globalProfile) { await deleteGlobalProfile() } else { deleteFixtureProfile(draft.id) } setDraft(structuredClone(BUILTIN_PROFILES[0])); setModeIndex(0); setError('') } catch (e) { setError(e instanceof Error ? e.message : String(e)) } })() }}>Delete profile</button></div></fieldset>
  </div>
}
