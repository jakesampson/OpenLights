import { PresetGroups } from './PresetGroups'
import { useMemo, useState } from 'react'
import { FixtureGroups } from './FixtureGroups'
import { useShowStore } from '../stores/showStore'
import { fixtureAttributes } from '../lib/automationRuntime'
import { getPresetColor } from '../lib/presetColor'
import type { EffectDef, FixtureDef } from '@shared/types'

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
    duplicateScene
  } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const [search, setSearch] = useState('')
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
        onSelect: () => goToScene(s.id)
      }))
    }

    const presetSection: Section = {
      id: 'presets', title: `Preset layers · ${presets.length}`, open: open.presets ?? true,
      children: presets.map((preset) => ({
        id: preset.id, label: preset.name, dot: preset.category === 'color' ? '#f2aaee' : '#a4c4f6',
        hint: `${preset.category} · ${Object.keys(preset.fixtureValues).length} fixtures`,
        active: activePresetIds.includes(preset.id), onSelect: () => togglePreset(preset.id)
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
      {sections.length === 0 && (
        <div className="px-2 py-3 text-[11px] text-dim">
          Patch fixtures and save scenes to populate this tree.
        </div>
      )}
      <FixtureGroups /><PresetGroups />
      <section className="p-2 text-xs"><h3>Sequences</h3>{(show?.sequences ?? []).map((s) => <button key={s.id} type="button" className="btn-theme m-1" onClick={() => useShowStore.getState().toggleSequence(s.id)}>{s.name} · Run / stop</button>)}</section>
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
                <button
                  key={child.id}
                  type="button"
                  onClick={(event) => child.onSelect?.(event.shiftKey)}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    child.active ? 'selected' : 'hover:bg-panel2'
                  } ${child.onSelect ? 'cursor-pointer' : 'cursor-default'}`}
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
              ))}
              {items.length === 0 && (
                <div className="px-2 py-1 text-[10px] text-dim">— empty —</div>
              )}
            </div>
          )}
        </div>
      )})}
    </div>
  )
}
