import { useMemo, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { fixtureAttributes } from '../lib/automationRuntime'
import type { EffectDef, FixtureDef, SceneDef } from '@shared/types'

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

function sceneColor(scene: SceneDef): string {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (const values of Object.values(scene.fixtureValues)) {
    if (!values) continue
    const dim = clampByte(values.intensity ?? 0) / 255
    r += (values.red ?? 0) * dim
    g += (values.green ?? 0) * dim
    b += (values.blue ?? 0) * dim
    count++
  }
  if (!count) return '#888888'
  const hex = (n: number) => Math.round(n / count).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

const TYPE_COLORS: Record<FixtureDef['type'], string> = {
  par: '#ffa07a',
  'led-wash': '#8ad3e8',
  'moving-head': '#c24bd6',
  dimmer: '#ffd700',
  'generic-led': '#a4f4a6'
}

interface Child {
  id: string
  label: string
  dot: string
  hint?: string
  active?: boolean
  onSelect?: () => void
}

interface Section {
  id: string
  title: string
  open: boolean
  children: Child[]
}

export function GroupsPresetsPanel() {
  const { show, scenes, effects, activeSceneId, goToScene, updateEffect } = useShowStore()
  const fixtures = show?.fixtures ?? []
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
      children: list.map((f) => ({
        id: f.id,
        label: f.name,
        dot: TYPE_COLORS[f.type] ?? '#888888',
        hint: `ch ${f.channelStart}–${f.channelStart + f.channels - 1} · ${fixtureAttributes(f.type).length} attrs`
      }))
    }))

    // Presets: real scenes, child dot tinted by the scene's average colour.
    const sceneSection: Section = {
      id: 'scenes',
      title: `Presets · ${scenes.length}`,
      open: open.scenes ?? true,
      children: scenes.map((s) => ({
        id: s.id,
        label: s.name,
        dot: sceneColor(s),
        hint: s.blackout ? 'blackout' : `${s.fadeMs}ms`,
        active: s.id === activeSceneId,
        onSelect: () => goToScene(s.id)
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

    return [...groupSections, sceneSection, effectSection]
  }, [fixtures, scenes, effects, open, activeSceneId, goToScene, updateEffect])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-1">
      {sections.length === 0 && (
        <div className="px-2 py-3 text-[11px] text-dim">
          Patch fixtures and save scenes to populate this tree.
        </div>
      )}
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col">
          <button
            type="button"
            onClick={() => toggle(section.id)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-dim hover:bg-panel2"
          >
            <span
              className="inline-block transition-transform"
              style={{ transform: section.open ? 'rotate(90deg)' : 'none' }}
            >
              ▸
            </span>
            {section.title}
            <span className="ml-auto rounded bg-panel2 px-1.5 py-0.5 text-[9px] text-dim">
              {section.children.length}
            </span>
          </button>
          {section.open && (
            <div className="flex flex-col gap-0.5 py-0.5 pl-4">
              {section.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={child.onSelect}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    child.active ? 'selected' : 'hover:bg-panel2'
                  } ${child.onSelect ? 'cursor-pointer' : 'cursor-default'}`}
                  title={child.hint}
                >
                  <span className="dot" style={{ backgroundColor: child.dot }} />
                  <span className="truncate">{child.label}</span>
                  {child.active && (
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-dim">on</span>
                  )}
                </button>
              ))}
              {section.children.length === 0 && (
                <div className="px-2 py-1 text-[10px] text-dim">— empty —</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
