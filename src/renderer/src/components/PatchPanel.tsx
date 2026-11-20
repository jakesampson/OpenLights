import { useEffect, useMemo, useState } from 'react'
import type { FixtureDef, FixtureProfile } from '@shared/types'
import { BUILTIN_PROFILES } from '@shared/fixtureProfiles'
import { modeChannelOffset } from '@shared/fixtureProfiles'
import { duplicateProfileAsCustom } from '@shared/oflFixtureFormat'
import { filterProfiles } from '../lib/filterProfiles'
import { fixtureWidth, placementError } from '../lib/patch'
import { useShowStore } from '../stores/showStore'
import { FixtureGroups } from './FixtureGroups'
import { FixtureProfileEditor } from './FixtureProfileEditor'
import { PatchDialog } from './PatchDialog'

const PATCH_MIME = 'application/x-openlights-fixture-profile'
interface DragProfile { kind: 'profile'; profileId: string; modeId: string }
interface DragFixture { kind: 'fixture'; fixtureId: string }
type DragPayload = DragProfile | DragFixture
interface OccupiedChannel { fixture: FixtureDef; offset: number; label: string }

function modeFor(profile: FixtureProfile, modeId?: string): FixtureProfile['modes'][number] {
  return profile.modes.find((mode) => mode.id === modeId) ?? profile.modes[0]
}

function fixtureProfile(fixture: FixtureDef, library: FixtureProfile[]): FixtureProfile | undefined {
  return fixture.profile ?? library.find((profile) => profile.id === fixture.profileId) ?? library.find((profile) => profile.legacyType === fixture.type)
}

export function PatchPanel({ onShowInPreview }: { onShowInPreview?: (fixtureId: string) => void }) {
  const { show, removeFixture } = useShowStore()
  const [oflProfiles, setOflProfiles] = useState<FixtureProfile[]>([])
  const library = useMemo(() => [...BUILTIN_PROFILES, ...(show?.fixtureProfiles ?? []), ...oflProfiles], [show?.fixtureProfiles, oflProfiles])
  const fixtures = show?.fixtures ?? []
  // User Fixtures (Jake, 20 Nov 2026): custom-created fixtures — OFL
  // duplicates, Build Your Own creations and imported JSONs — live in a
  // category pinned to the top of the brands column. A fixture is the
  // user's own when it carries the custom tag, or when it is stored in
  // this show (edited copies and imports predate the tag).
  const USER_FIXTURES = 'User Fixtures'
  const showProfileSet = useMemo(() => new Set(show?.fixtureProfiles ?? []), [show?.fixtureProfiles])
  const isUserFixture = (profile: FixtureProfile) => profile.custom === true || showProfileSet.has(profile)
  const brands = useMemo(() => [...new Set(library.map((profile) => profile.manufacturer || 'Generic'))].sort((a, b) => a.localeCompare(b)), [library])
  const manufacturers = useMemo(() => [USER_FIXTURES, ...brands], [brands])
  const [query, setQuery] = useState('')
  const [manufacturer, setManufacturer] = useState(brands[0] ?? 'Generic')
  const [selectedProfileId, setSelectedProfileId] = useState(library[0]?.id ?? '')
  const selectedProfile = library.find((profile) => profile.id === selectedProfileId) ?? library.find((profile) => profile.manufacturer === manufacturer) ?? library[0]
  const [modeId, setModeId] = useState(selectedProfile?.modes[0]?.id ?? '')
  const selectedMode = selectedProfile ? modeFor(selectedProfile, modeId) : undefined
  const [dragRange, setDragRange] = useState<{ start: number; end: number; valid: boolean } | null>(null)
  const [dragging, setDragging] = useState<DragPayload | null>(null)
  const [patchError, setPatchError] = useState('')
  const [patchNotice, setPatchNotice] = useState('')
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProfileId, setEditorProfileId] = useState<string | null>(null)
  const [editorCreateCustom, setEditorCreateCustom] = useState(false)
  const [patchDialog, setPatchDialog] = useState<{ profile: FixtureProfile; modeId: string; start: number } | null>(null)
  const [editDialog, setEditDialog] = useState<{ fixture: FixtureDef; profile: FixtureProfile } | null>(null)

  useEffect(() => {
    let active = true
    void window.electronAPI.listOflProfiles().then((profiles) => { if (active && Array.isArray(profiles)) setOflProfiles(profiles) }).catch(() => {})
    return () => { active = false }
  }, [])

  // The library search + brand filter (lib/filterProfiles): a model
  // matches when its brand is selected and the query (name or brand)
  // matches, so the search box and the brand list share one filter. The
  // User Fixtures category matches the user's own fixtures instead of a
  // brand.
  const matchingProfiles = useMemo(() => {
    const filtered = filterProfiles(library, { query, manufacturer: manufacturer === USER_FIXTURES ? undefined : manufacturer })
    return manufacturer === USER_FIXTURES ? filtered.filter(isUserFixture) : filtered
  }, [library, query, manufacturer, showProfileSet])

  const occupied = useMemo(() => {
    const result = new Map<number, OccupiedChannel>()
    for (const fixture of fixtures.filter((item) => (item.universe ?? 1) === 1)) {
      const profile = fixtureProfile(fixture, library)
      const mode = profile ? modeFor(profile, fixture.modeId) : undefined
      for (let offset = 0; offset < fixture.channels; offset++) {
        // The channel at this DMX offset, after the flexible-LED remap
        // (globals slide down behind a reduced LED block).
        const channel = mode?.channels.find((item) => modeChannelOffset(mode, item.number, fixture.ledCount) === offset)
        result.set(fixture.channelStart + offset, { fixture, offset, label: channel?.attribute ?? `Channel ${offset + 1}` })
      }
    }
    return result
  }, [fixtures, library])

  const openEditFixture = (fixture: FixtureDef) => {
    // LightKey: double-clicking a patched fixture reopens the patch
    // dialog for that fixture, in edit mode.
    const profile = fixtureProfile(fixture, library)
    if (!profile) return
    setEditDialog({ fixture, profile })
    setPatchError('')
  }

  const chooseProfile = (profile: FixtureProfile) => {
    setSelectedProfileId(profile.id)
    setModeId(profile.modes[0]?.id ?? '')
    setPatchError('')
  }

  const dragProfile = (event: React.DragEvent, profile: FixtureProfile) => {
    const payload: DragProfile = { kind: 'profile', profileId: profile.id, modeId: profile.id === selectedProfileId ? modeId : profile.modes[0]?.id ?? '' }
    event.dataTransfer.setData(PATCH_MIME, JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setDragImage(document.createElement('canvas'), 0, 0)
    setDragging(payload)
    chooseProfile(profile)
  }

  const dragFixture = (event: React.DragEvent, fixture: FixtureDef) => {
    const payload: DragFixture = { kind: 'fixture', fixtureId: fixture.id }
    event.dataTransfer.setData(PATCH_MIME, JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setDragImage(document.createElement('canvas'), 0, 0)
    setSelectedFixtureId(fixture.id)
    setDragging(payload)
    setPatchError('')
  }

  const readDrag = (event: React.DragEvent): DragPayload | null => {
    try {
      const payload = JSON.parse(event.dataTransfer.getData(PATCH_MIME)) as DragPayload
      if (payload.kind === 'fixture') return fixtures.some((fixture) => fixture.id === payload.fixtureId) ? payload : null
      return library.some((profile) => profile.id === payload.profileId) ? payload : null
    } catch { return null }
  }

  const resolvedDrag = (event: React.DragEvent) => {
    const payload = dragging ?? readDrag(event)
    if (!payload) return null
    if (payload.kind === 'fixture') {
      const fixture = fixtures.find((item) => item.id === payload.fixtureId)
      return fixture ? { payload, width: fixture.channels, fixture } : null
    }
    const profile = library.find((item) => item.id === payload.profileId)
    return profile ? { payload, width: fixtureWidth(profile, payload.modeId), profile } : null
  }

  const previewDrop = (event: React.DragEvent, start: number) => {
    const dragged = resolvedDrag(event)
    if (!dragged) return
    event.preventDefault()
    event.dataTransfer.dropEffect = dragged.payload.kind === 'fixture' ? 'move' : 'copy'
    const ignoreId = dragged.payload.kind === 'fixture' ? dragged.payload.fixtureId : undefined
    setDragRange({ start, end: start + dragged.width - 1, valid: placementError(fixtures, start, dragged.width, ignoreId) === null })
  }

  const dropProfile = (event: React.DragEvent, start: number) => {
    const dragged = resolvedDrag(event)
    if (!dragged) return
    event.preventDefault()
    setDragRange(null)
    setDragging(null)
    if (dragged.payload.kind === 'fixture') {
      const error = placementError(fixtures, start, dragged.width, dragged.payload.fixtureId)
      if (error) { setPatchError(error); return }
      try {
        useShowStore.getState().updateFixture(dragged.payload.fixtureId, { channelStart: start })
        setSelectedFixtureId(dragged.payload.fixtureId)
        setPatchError('')
      } catch (reason) { setPatchError(reason instanceof Error ? reason.message : String(reason)) }
      return
    }
    // Dragging a profile opens the patch options dialog (LightKey Guide
    // pp.29–30) instead of patching immediately — the dialog validates
    // the address live and lets the user correct it there.
    if (dragged.profile) setPatchDialog({ profile: dragged.profile, modeId: dragged.payload.modeId, start })
  }

  const occupiedCount = occupied.size
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId)
  // The edit dialog works on the live fixture object from the store, not
  // the snapshot taken at double-click time — otherwise the footer and
  // the validation in the dialog would go stale after the first edit.
  const editFixture = editDialog ? fixtures.find((fixture) => fixture.id === editDialog.fixture.id) : undefined

  // The OFL library is a zip the user uploads (Jake, 20 Nov 2026 —
  // nothing ships with the app any more): the main process extracts it
  // and merges it into the library, and the open show re-heals against
  // the uploaded library, so a fixture whose snapshot went stale while
  // the library was empty lights up again without touching the wheel
  // (Q3). The merge keeps the current selection — it never drops a
  // profile — so there is no jump to the top of the list.
  const importOflLibraryZip = async () => {
    try {
      const result = await window.electronAPI.importOflLibraryZip()
      if (result.canceled) return
      if (!result.success) throw new Error(result.error ?? 'Could not import the OFL library')
      const profiles = Array.isArray(result.profiles) ? result.profiles : []
      setOflProfiles(profiles)
      useShowStore.getState().setOflProfiles(profiles)
      setPatchError('')
      setPatchNotice(`Imported ${result.imported ?? profiles.length} OFL fixtures${result.skipped ? ` · skipped ${result.skipped} unsupported files` : ''}`)
    } catch (reason) { setPatchError(reason instanceof Error ? reason.message : String(reason)) }
  }

  // Duplicate the selected library record into the user's own fixture:
  // tagged custom, so no zip upload ever updates it. OFL library records
  // duplicate through the main process (the global library DB); built-ins
  // and show-stored profiles duplicate locally into this show instead.
  // The button used to be disabled for anything but an OFL record, so
  // with no OFL library uploaded — every visible profile a built-in — it
  // was dead in the wizard, and a disabled button with no dimmed styling
  // looks clickable but does nothing (Jake, 20 Nov 2026,
  // image-ecf244b1.png). The brands column switches to User Fixtures and
  // selects the copy, so the result is visible immediately (Jake, 20 Nov
  // 2026 — Duplicate used to give no visible feedback at all).
  const duplicateSelectedProfile = async () => {
    if (!selectedProfile) return
    if (oflProfiles.some((profile) => profile.id === selectedProfile.id)) {
      try {
        const result = await window.electronAPI.duplicateOflProfile(selectedProfile.id)
        if (!result.success) throw new Error(result.error ?? 'Could not duplicate the fixture')
        const profiles = Array.isArray(result.profiles) ? result.profiles : []
        setOflProfiles(profiles)
        useShowStore.getState().setOflProfiles(profiles)
        if (result.profile) { setManufacturer(USER_FIXTURES); chooseProfile(result.profile) }
        setPatchError('')
        setPatchNotice('Duplicated as a custom fixture — OFL zip uploads will never update it')
      } catch (reason) { setPatchError(reason instanceof Error ? reason.message : String(reason)) }
      return
    }
    try {
      const copy = duplicateProfileAsCustom(selectedProfile)
      useShowStore.getState().saveFixtureProfile(copy)
      setManufacturer(USER_FIXTURES)
      chooseProfile(copy)
      setPatchError('')
      setPatchNotice('Duplicated as a custom fixture — OFL zip uploads will never update it')
    } catch (reason) { setPatchError(reason instanceof Error ? reason.message : String(reason)) }
  }

  return <section className="relative flex h-full min-h-0 gap-3" aria-label="Fixture patch workspace">
    <aside className="flex w-[420px] shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-panel" aria-label="Fixture library">
      <div className="border-b border-line p-3"><input aria-label="Search fixture library" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search fixtures" className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm" /></div>
      {!oflProfiles.length && <div className="border-b border-line bg-panel2 px-3 py-2 text-[11px] leading-snug text-dim">No fixture library yet — download the OFL fixture library (.zip) from open-fixture-library.org and upload it here. Fixtures you duplicate stay yours: uploads never replace a custom fixture.<div className="mt-2"><button type="button" className="btn-theme text-[10px]" onClick={() => void importOflLibraryZip()}>Import</button></div></div>}
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-line">
        <div className="min-h-0 overflow-y-auto p-2" aria-label="Fixture brands">
          {manufacturers.map((brand) => <button key={brand} type="button" aria-pressed={manufacturer === brand} className={`mb-1 block w-full truncate rounded px-2 py-1.5 text-left text-xs ${manufacturer === brand ? 'bg-accent text-black' : 'hover:bg-panel2'}`} onClick={() => { setManufacturer(brand); const first = brand === USER_FIXTURES ? library.find(isUserFixture) : library.find((profile) => (profile.manufacturer || 'Generic') === brand); if (first) chooseProfile(first) }}>{brand}</button>)}
        </div>
        <div className="min-h-0 overflow-y-auto p-2" aria-label="Fixture models">
          {matchingProfiles.map((profile) => {
            const mode = profile.modes[0]
            const channels = mode ? fixtureWidth(profile, mode.id) : 0
            return <button key={profile.id} type="button" draggable aria-pressed={selectedProfile?.id === profile.id} className={`mb-1 block w-full rounded px-2 py-1.5 text-left ${selectedProfile?.id === profile.id ? 'bg-accent text-black' : 'hover:bg-panel2'}`} onClick={() => chooseProfile(profile)} onDragStart={(event) => dragProfile(event, profile)} onDragEnd={() => { setDragging(null); setDragRange(null) }}><span className="block truncate text-xs font-medium">{profile.name}{isUserFixture(profile) && <span className="ml-1 rounded border border-current px-1 text-[8px] font-semibold uppercase">Custom</span>}</span><span className="block text-[9px] opacity-70">{channels} channels</span></button>
          })}
          {!matchingProfiles.length && <p className="p-2 text-xs text-dim">{manufacturer === USER_FIXTURES ? 'No custom fixtures yet — duplicate a fixture or build your own to add one here.' : 'No matching models'}</p>}
        </div>
      </div>
      {/* Jake, 20 Nov 2026: five equal buttons, no wrapping, no model
          count — the footer is actions only, all the same size. */}
      <footer className="flex items-center gap-1 border-t border-line px-3 py-2"><button type="button" className="btn-theme patch-footer-btn" onClick={() => void importOflLibraryZip()}>Import</button><button type="button" className="btn-theme patch-footer-btn" disabled={!selectedProfile} onClick={() => void duplicateSelectedProfile()}>Duplicate</button><button type="button" className="btn-theme patch-footer-btn" onClick={() => { setEditorProfileId(null); setEditorCreateCustom(true); setEditorOpen(true) }}>+ Custom</button><button type="button" className="btn-theme patch-footer-btn" onClick={() => { setEditorCreateCustom(false); setEditorOpen(true) }}>Profile editor</button><button type="button" className="btn-theme patch-footer-btn" onClick={() => setGroupsOpen(true)}>Fixture groups</button></footer>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-panel" aria-label="Universe 1 patch matrix">
      <header className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-2">
        <div className="rounded-md bg-accent px-8 py-2 text-center text-xs font-semibold text-black"><strong className="block">Universe 1</strong><span>USB DMX</span></div>
        {selectedProfile && selectedMode && <div className="min-w-0 flex-1 text-xs"><strong className="block truncate">{selectedProfile.manufacturer} · {selectedProfile.name}</strong><label className="mt-1 inline-flex items-center gap-2 text-dim">Mode<select aria-label="Fixture mode" value={selectedMode.id} onChange={(event) => setModeId(event.target.value)} className="rounded bg-panel2 px-2 py-1 text-text">{selectedProfile.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name} · {fixtureWidth(selectedProfile, mode.id)}ch</option>)}</select></label></div>}
        {selectedFixture && <div className="flex items-center gap-2 text-xs"><span>{selectedFixture.name} · {selectedFixture.channelStart}–{selectedFixture.channelStart + selectedFixture.channels - 1}</span><button type="button" className="text-red-300" onClick={() => { removeFixture(selectedFixture.id); setSelectedFixtureId(null) }}>Remove</button></div>}
      </header>
      {patchError && <div role="alert" className="border-b border-red-500/40 bg-red-950/40 px-4 py-2 text-xs text-red-200">{patchError}</div>}
      {patchNotice && <div role="status" className="border-b border-emerald-500/40 bg-emerald-950/30 px-4 py-2 text-xs text-emerald-200">{patchNotice}</div>}
      <div className="grid min-h-0 flex-1 gap-px overflow-hidden bg-line p-px" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gridTemplateRows: 'repeat(22, minmax(0, 1fr))' }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragRange(null) }}>
        {Array.from({ length: 512 }, (_, index) => index + 1).map((channel) => {
          const item = occupied.get(channel)
          const highlighted = dragRange && channel >= dragRange.start && channel <= dragRange.end
          const isSelected = item?.fixture.id === selectedFixtureId
          return <button key={channel} type="button" draggable={Boolean(item)} data-channel={channel} aria-label={item ? `Channel ${channel}: ${item.fixture.name}, ${item.label}` : `Channel ${channel}: free`} title={item ? `${channel} · ${item.fixture.name} · ${item.label}` : `${channel} · Free`} className={`min-h-0 min-w-0 overflow-hidden px-1 text-left text-[9px] leading-tight ${item ? 'bg-panel2 text-text' : 'bg-bg text-dim'} ${item?.offset === 0 ? 'font-semibold text-accent' : ''} ${isSelected && !dragging ? 'ring-1 ring-inset ring-accent' : ''} ${highlighted ? (dragRange.valid ? '!bg-blue-600/85 !text-white' : '!bg-red-700/70 !text-white') : ''}`} onClick={() => item && setSelectedFixtureId(item.fixture.id)} onDoubleClick={() => item && openEditFixture(item.fixture)} onDragStart={(event) => item && dragFixture(event, item.fixture)} onDragEnd={() => { setDragging(null); setDragRange(null) }} onDragOver={(event) => previewDrop(event, channel)} onDrop={(event) => dropProfile(event, channel)}><span className="block font-mono opacity-70">{String(channel).padStart(3, '0')}</span>{item && <span className="block truncate">{item.offset === 0 ? item.fixture.name : item.label}</span>}</button>
        })}
      </div>
      <footer className="flex justify-between border-t border-line px-4 py-2 text-[10px] text-dim"><span>Drag a model to add it, or drag a patched fixture to a new starting address</span><span>{occupiedCount} occupied · {512 - occupiedCount} free</span></footer>
    </div>
    {groupsOpen && <div role="dialog" aria-modal="true" aria-label="Fixture groups" className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-8"><div className="panel w-full max-w-lg p-4"><div className="mb-3 flex items-center justify-between"><strong className="text-sm">Fixture groups</strong><button type="button" className="btn-theme text-xs" onClick={() => setGroupsOpen(false)}>Done</button></div><FixtureGroups /></div></div>}
    {editorOpen && <div role="dialog" aria-modal="true" aria-label="Fixture profile editor" className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-8"><div className="panel max-h-full w-full max-w-4xl overflow-auto p-4"><div className="mb-3 flex items-center justify-between"><strong className="text-sm">Fixture profile editor</strong><button type="button" className="btn-theme text-xs" onClick={() => { setEditorOpen(false); setEditorProfileId(null); setEditorCreateCustom(false) }}>Done</button></div><FixtureProfileEditor profiles={library} initialProfileId={editorProfileId ?? undefined} createCustom={editorCreateCustom} /></div></div>}
    {patchDialog && <PatchDialog profile={patchDialog.profile} initialModeId={patchDialog.modeId} start={patchDialog.start} onPatched={(message) => { setPatchNotice(message); setPatchError(''); setPatchDialog(null) }} onClose={() => setPatchDialog(null)} onShowProfileInLibrary={(profile) => { chooseProfile(profile); setPatchDialog(null) }} onEditProfile={(profile) => { chooseProfile(profile); setEditorProfileId(profile.id); setEditorCreateCustom(false); setEditorOpen(true); setPatchDialog(null) }} />}
    {editDialog && editFixture && <PatchDialog profile={editDialog.profile} initialModeId={editFixture.modeId ?? editDialog.profile.modes[0]?.id ?? ''} start={editFixture.channelStart} fixture={editFixture} onPatched={() => {}} onClose={() => setEditDialog(null)} onNotice={(message) => { setPatchNotice(message); setPatchError(''); setEditDialog(null) }} onShowInPreview={onShowInPreview} onShowProfileInLibrary={(profile) => { chooseProfile(profile); setEditDialog(null) }} onEditProfile={(profile) => { chooseProfile(profile); setEditorProfileId(profile.id); setEditorCreateCustom(false); setEditorOpen(true); setEditDialog(null) }} />}
  </section>
}
