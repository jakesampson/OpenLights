import { PresetGroups } from './PresetGroups'
import { SequenceEditor } from './SequenceEditor'
import { useMemo, useRef, useState } from 'react'
import { FixtureGroups } from './FixtureGroups'
import { useShowStore } from '../stores/showStore'
import { fixtureAttributes } from '../lib/automationRuntime'
import { getPresetColor } from '../lib/presetColor'
import { encodeLiveDrop, LIVE_DROP_MIME, LEGACY_PRESET_MIME, type LiveDropPayload } from '../lib/liveDrops'
import { exportPresetPalette, importPresetPalette, serializePresetPalette } from '../lib/presetPaletteIo'
import type { EffectDef, FixtureDef, SceneDef } from '@shared/types'

const TYPE_COLORS: Record<FixtureDef['type'], string> = {
  par: '#ffa07a',
  'led-wash': '#8ad3e8',
  'moving-head': '#c24bd6',
  dimmer: '#ffd700',
  'generic-led': '#a4f4a6',
  'pixel-bar-17ch': '#ffdf74',
  'rgba-4ch': '#ef9bff',
  'rgbw-4ch': '#a4f4a6'
}

interface Child {
  id: string
  label: string
  dot: string
  hint?: string
  active?: boolean
  activeLabel?: string
  onSelect?: (shiftKey: boolean) => void
  onEdit?: () => void
  /** Drag onto a Live page in Edit mode to create a button for this item. */
  dragPayload?: LiveDropPayload
}

interface Section {
  id: string
  title: string
  open: boolean
  children: Child[]
  onSelectAll?: () => void
}

export function GroupsPresetsPanel() {
  const {
    show,
    scenes,
    presets,
    activePresetIds,
    togglePreset,
    effects,
    activeSceneId,
    selectedFixtureIds,
    goToScene,
    selectFixture,
    selectFixtures,
    updateEffect,
    addScene,
    duplicateScene,
    updateScene,
    deleteScene,
    convertScenesToPresets,
    updateProject
  } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const [search, setSearch] = useState('')
  const [paletteNote, setPaletteNote] = useState('')
  const paletteFile = useRef<HTMLInputElement>(null)

  // Preset palette file exchange moved here from the old Live Edit bottom
  // strip (LightKey keeps the Preset Palette in the right sidebar).
  const exportPalette = () => {
    try {
      const doc = exportPresetPalette(presets, show?.fixtures ?? [])
      const url = URL.createObjectURL(new Blob([serializePresetPalette(doc)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'openlights-preset-palette.json'
      a.click()
      URL.revokeObjectURL(url)
      setPaletteNote(`Exported ${presets.length} preset${presets.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setPaletteNote(`Export failed: ${String(error)}`)
    }
  }
  const importPalette = async (text: string) => {
    try {
      const result = importPresetPalette(text, show?.fixtures ?? [], {
        onSkip: (info) => console.warn(`Preset palette: skipped fixture ${info.fixtureName} (${info.fixtureId}) — ${info.reason}`)
      })
      updateProject({ presets: [...presets, ...result.presets] })
      const skipped = result.skipped.length
      setPaletteNote(`Imported ${result.presets.length} preset${result.presets.length === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} fixture${skipped === 1 ? '' : 's'} (see console)` : ''}.`)
    } catch (error) {
      setPaletteNote(`Import failed: ${String(error)}`)
    }
  }
  const [editingScene, setEditingScene] = useState<SceneDef | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({
    groups: true,
    scenes: true,
    effects: true,
    cues: true
  })

  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }))

  const sections = useMemo((): Section[] => {
    // Groups: one section per fixture group (real data from the patch),
    // children are the fixtures in that group.
    const groupMap = new Map<string, FixtureDef[]>()
    for (const f of fixtures) {
      const key = f.group?.trim() || 'Unassigned'
      const list = groupMap.get(key) ?? []
      list.push(f)
      groupMap.set(key, list)
    }
    const groupSections: Section[] = [...groupMap.entries()].map(([name, list], gi) => ({
      id: `group-${name}`,
      title: `${name} · ${list.length}`,
      open: open[`group-${name}`] ?? gi === 0,
      onSelectAll: () => selectFixtures(list.map((fixture) => fixture.id)),
      children: list.map((f) => ({
        id: f.id,
        label: f.name,
        dot: TYPE_COLORS[f.type] ?? '#888888',
        hint: `ch ${f.channelStart}–${f.channelStart + f.channels - 1} · ${fixtureAttributes(f).length} attrs`,
        active: selectedFixtureIds.includes(f.id),
        activeLabel: 'selected',
        onSelect: (shiftKey) => selectFixture(f.id, shiftKey)
      }))
    }))

    // Presets: real scenes, child dot tinted by their active RGB output.
    const sceneSection: Section = {
      id: 'scenes',
      title: `Scenes · ${scenes.length}`,
      open: open.scenes ?? true,
      children: scenes.map((s) => ({
        id: s.id,
        label: s.name,
        dot: getPresetColor(s),
        hint: s.blackout ? 'blackout' : `${s.fadeMs}ms`,
        active: s.id === activeSceneId,
        onSelect: () => goToScene(s.id),
        onEdit: () => setEditingScene(structuredClone(s))
      }))
    }

    const presetSection: Section = {
      id: 'presets', title: `Preset layers · ${presets.length}`, open: open.presets ?? true,
      children: presets.map((preset) => ({
        id: preset.id, label: preset.name, dot: preset.category === 'color' ? '#f2aaee' : '#a4c4f6',
        hint: `${preset.category} · ${Object.keys(preset.fixtureValues).length} fixtures — drag onto a Live page in Edit mode to add a button`,
        active: activePresetIds.includes(preset.id), onSelect: () => togglePreset(preset.id),
        dragPayload: { presetIds: [preset.id], sequenceIds: [], presetNames: { [preset.id]: preset.name } }
      }))
    }

    // Effects: real effect rows; clicking toggles the enabled flag.
    const effectSection: Section = {
      id: 'effects',
      title: `Effects · ${effects.length}`,
      open: open.effects ?? true,
      children: effects.map((e: EffectDef) => ({
        id: e.id,
        label: e.name,
        dot: e.enabled ? '#a4f4a6' : '#5d3a72',
        hint: `${e.attribute} · ${e.waveform}`,
        active: e.enabled,
        onSelect: () => updateEffect(e.id, { enabled: !e.enabled })
      }))
    }

    return [...(show?.fixtureGroups?.length ? [] : groupSections), sceneSection, ...(show?.presetGroups?.length ? [] : [presetSection]), effectSection]
  }, [
    fixtures,
    show?.fixtureGroups,
    scenes,
    presets,
    activePresetIds,
    togglePreset,
    effects,
    open,
    activeSceneId,
    selectedFixtureIds,
    goToScene,
    selectFixture,
    selectFixtures,
    updateEffect
  ])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-1">
      <div className="flex gap-1 px-1 pb-2">
        <input type="search" aria-label="Search palette" placeholder="Search palette" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 rounded border border-line bg-bg/50 px-2 py-1 text-xs text-text placeholder:text-dim" />
        <button type="button" className="rounded border border-line bg-panel2 px-2 text-sm text-text" onClick={() => activeSceneId ? duplicateScene(activeSceneId) : addScene()} title={activeSceneId ? 'Duplicate active scene' : 'Create a scene'} aria-label={activeSceneId ? 'Duplicate active scene' : 'Create a scene'}>+</button>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-1 pb-1 text-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">Preset palette</span>
        <button type="button" className="btn-theme" onClick={exportPalette} disabled={!presets.length}>Export JSON</button>
        <button type="button" className="btn-theme" onClick={() => paletteFile.current?.click()}>Import JSON</button>
        <button type="button" className="btn-theme" disabled={!scenes.length} onClick={() => { const added = convertScenesToPresets(); setPaletteNote(added ? `Converted ${added} scene${added === 1 ? '' : 's'} to presets (originals kept).` : 'Scenes already converted.') }}>Convert scenes</button>
        <input ref={paletteFile} type="file" accept="application/json,.json" aria-label="Import preset palette JSON" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await importPalette(await file.text()) }} />
        {paletteNote && <span className="text-dim" role="status">{paletteNote}</span>}
      </div>
      {sections.length === 0 && (
        <div className="px-2 py-3 text-[11px] text-dim">
          Patch fixtures and save scenes to populate this tree.
        </div>
      )}
      <FixtureGroups /><PresetGroups />
      <SequenceEditor />
      {sections.map((section) => {
        const query = search.trim().toLowerCase()
        const items = query ? section.children.filter((child) => child.label.toLowerCase().includes(query) || section.title.toLowerCase().includes(query)) : section.children
        if (query && items.length === 0) return null
        const expanded = Boolean(query) || section.open
        return (
        <div key={section.id} className="flex flex-col">
          <button
            type="button"
            onClick={() => toggle(section.id)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-dim hover:bg-panel2"
          >
            <span
              className="inline-block transition-transform"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
            >
              ▸
            </span>
            {section.title}
            <span className="ml-auto rounded bg-panel2 px-1.5 py-0.5 text-[9px] text-dim">
              {section.children.length}
            </span>
          </button>
          {section.onSelectAll && expanded && <button type="button" onClick={section.onSelectAll} className="ml-4 self-start rounded px-2 py-1 text-[10px] text-dim hover:bg-panel2 hover:text-text">Select group</button>}
          {expanded && (
            <div className="flex flex-col gap-0.5 py-0.5 pl-4">
              {items.map((child) => (
                <div className="group flex items-center gap-1 pr-1">
                <button
                  key={child.id}
                  type="button"
                  draggable={Boolean(child.dragPayload)}
                  onDragStart={(event) => {
                    if (!child.dragPayload) return
                    event.dataTransfer.setData(LIVE_DROP_MIME, encodeLiveDrop(child.dragPayload))
                    if (child.dragPayload.presetIds.length === 1) event.dataTransfer.setData(LEGACY_PRESET_MIME, child.dragPayload.presetIds[0])
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={(event) => child.onSelect?.(event.shiftKey)}
                  className={`min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    child.active ? 'selected' : 'hover:bg-panel2'
                  } ${child.onSelect ? 'cursor-pointer' : 'cursor-default'} ${child.dragPayload ? 'cursor-grab' : ''}`}
                  title={child.hint}
                >
                  <span className="dot" style={{ backgroundColor: child.dot }} />
                  <span className="truncate">{child.label}</span>
                  {child.active && (
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-dim">
                      {child.activeLabel ?? 'on'}
                    </span>
                  )}
                </button>
                {child.onEdit && <button type="button" aria-label={`Edit ${child.label}`} title={`Edit ${child.label}`} onClick={child.onEdit} className="scene-tree-edit rounded px-1.5 py-1 text-[10px] text-dim">Edit</button>}
                </div>
              ))}
              {items.length === 0 && (
                <div className="px-2 py-1 text-[10px] text-dim">— empty —</div>
              )}
            </div>
          )}
        </div>
      )})}
      {editingScene && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingScene(null) }}>
        <section role="dialog" aria-modal="true" aria-label="Edit scene" className="panel w-full max-w-md p-4 shadow-2xl">
          <header className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Edit scene</h2><button type="button" onClick={() => setEditingScene(null)}>Close</button></header>
          <div className="space-y-3 text-xs">
            <label className="block">Name<input aria-label="Scene name" className="mt-1 w-full rounded border border-line bg-bg p-2" value={editingScene.name} onChange={(event) => setEditingScene({ ...editingScene, name: event.target.value })} /></label>
            <label className="block">Fade time (ms)<input aria-label="Scene fade time" type="number" min="0" className="mt-1 w-full rounded border border-line bg-bg p-2" value={editingScene.fadeMs} onChange={(event) => setEditingScene({ ...editingScene, fadeMs: Math.max(0, Number(event.target.value)) })} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editingScene.blackout === true} onChange={(event) => setEditingScene({ ...editingScene, blackout: event.target.checked })} />Blackout scene</label>
            <p className="text-dim">Fixture properties are adjusted from the floating Preview controls. Existing scene data is preserved.</p>
          </div>
          <footer className="mt-4 flex justify-between"><button type="button" className="text-red-300" onClick={() => { if (confirm(`Delete scene “${editingScene.name}”?`)) { deleteScene(editingScene.id); setEditingScene(null) } }}>Delete</button><button type="button" className="btn-theme on" onClick={() => { updateScene(editingScene.id, { name: editingScene.name.trim() || 'Untitled scene', fadeMs: editingScene.fadeMs, blackout: editingScene.blackout, fixtureValues: editingScene.fixtureValues }); setEditingScene(null) }}>Save</button></footer>
        </section>
      </div>}
    </div>
  )
}
