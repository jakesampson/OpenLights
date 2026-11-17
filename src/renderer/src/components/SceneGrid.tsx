import { useMemo, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { fixtureAttributes } from '../lib/automationRuntime'
import type { FixtureDef, SceneDef } from '@shared/types'

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

function toHex(values: Record<string, number>): string {
  const part = (key: string) => clampByte(values[key] ?? 0).toString(16).padStart(2, '0')
  return `#${part('red')}${part('green')}${part('blue')}`
}

function applyHex(values: Record<string, number>, hex: string): Record<string, number> {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { ...values, red: r, green: g, blue: b }
}

function sceneColor(scene: SceneDef, fixtures: FixtureDef[]): string {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (const fixture of fixtures) {
    const values = scene.fixtureValues[fixture.id]
    if (!values) continue
    const dim = (values.intensity ?? 0) / 255
    r += (values.red ?? 0) * dim
    g += (values.green ?? 0) * dim
    b += (values.blue ?? 0) * dim
    count++
  }
  if (count === 0 || (r === 0 && g === 0 && b === 0)) return 'rgb(39, 39, 42)'
  const scale = 1 / Math.max(1, count)
  const lift = 18
  return `rgb(${Math.round(r * scale) + lift}, ${Math.round(g * scale) + lift}, ${Math.round(b * scale) + lift})`
}

export function SceneGrid() {
  const {
    show,
    scenes,
    activeSceneId,
    goToScene,
    flashScene,
    endFlash,
    addScene,
    duplicateScene,
    updateScene,
    deleteScene
  } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const [editing, setEditing] = useState<SceneDef | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, FixtureDef[]>()
    for (const fixture of fixtures) {
      const group = fixture.group?.trim() || 'Ungrouped'
      const list = map.get(group) ?? []
      list.push(fixture)
      map.set(group, list)
    }
    return [...map.entries()]
  }, [fixtures])

  const setEditingValue = (fixtureId: string, attr: string, value: number) => {
    setEditing((scene) => {
      if (!scene) return scene
      const values = { ...(scene.fixtureValues[fixtureId] ?? {}), [attr]: clampByte(value) }
      return {
        ...scene,
        fixtureValues: { ...scene.fixtureValues, [fixtureId]: values }
      }
    })
  }

  const saveEditing = () => {
    if (!editing) return
    updateScene(editing.id, {
      name: editing.name.trim() || 'Untitled scene',
      fadeMs: Math.max(0, Math.round(editing.fadeMs)),
      blackout: editing.blackout,
      fixtureValues: editing.fixtureValues
    })
    setEditing(null)
  }

  const removeEditing = () => {
    if (!editing) return
    if (!confirm(`Delete scene “${editing.name}”?`)) return
    deleteScene(editing.id)
    setEditing(null)
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Scenes</h2>
        <button
          onClick={addScene}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          + New Scene
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {scenes.map((scene) => {
          const color = sceneColor(scene, fixtures)
          const isActive = scene.id === activeSceneId
          return (
            <div
              key={scene.id} data-project-id={scene.id}
              className={`group relative overflow-hidden rounded-xl border bg-zinc-900 transition-all duration-200 ${
                isActive
                  ? 'border-indigo-400 shadow-lg shadow-indigo-500/20'
                  : 'border-zinc-800 hover:border-indigo-500/60'
              }`}
            >
              <button
                onClick={() => goToScene(scene.id)}
                className="block w-full text-left active:scale-[0.99]"
              >
                <div
                  className="flex h-28 w-full items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, rgba(20,20,25,0.92), ${color})`
                  }}
                >
                  <span className="px-3 text-center text-lg font-semibold text-white drop-shadow">
                    {scene.name}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-xs text-zinc-400">
                  <span>{scene.fadeMs} ms fade</span>
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300">
                    {isActive ? 'Live' : 'Go'}
                  </span>
                </div>
              </button>
              <button
                onClick={() => setEditing(structuredClone(scene))}
                className="absolute right-2 top-2 rounded bg-black/40 px-2 py-1 text-[10px] text-zinc-300 opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              >
                Edit
              </button>
              <button
                onPointerDown={(e) => {
                  e.preventDefault()
                  flashScene(scene.id)
                }}
                onPointerUp={endFlash}
                onPointerLeave={endFlash}
                onPointerCancel={endFlash}
                onContextMenu={(e) => e.preventDefault()}
                className="absolute bottom-2 right-2 rounded bg-amber-500/80 px-2 py-1 text-[10px] font-semibold text-black opacity-0 transition-opacity hover:bg-amber-400 group-hover:opacity-100"
              >
                Flash
              </button>
              {scene.blackout && (
                <span className="absolute left-2 top-2 rounded bg-red-600/80 px-2 py-1 text-[10px] uppercase tracking-wider text-white">
                  Blackout
                </span>
              )}
            </div>
          )
        })}

        <button
          onClick={addScene}
          className="flex h-[172px] items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 text-sm text-zinc-500 hover:border-indigo-500/60 hover:text-zinc-300"
        >
          + Add scene
        </button>
      </div>

      {scenes.length === 0 && (
        <div className="text-xs text-zinc-500">
          No scenes yet. Add fixtures in the Patch tab, then create a scene.
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6">
          <div className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">
                Edit Scene
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="text-xs text-zinc-500 hover:text-zinc-200"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-4 px-5 py-4">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Name</span>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-56 rounded bg-zinc-800 px-3 py-1.5 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Fade (ms)
                </span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={editing.fadeMs}
                  onChange={(e) => setEditing({ ...editing, fadeMs: Number(e.target.value) })}
                  className="w-28 rounded bg-zinc-800 px-3 py-1.5 text-sm text-white"
                />
              </label>
              <label className="flex items-center gap-2 pb-1 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={editing.blackout ?? false}
                  onChange={(e) => setEditing({ ...editing, blackout: e.target.checked })}
                />
                Blackout scene
              </label>
            </div>

            <div className="max-h-[55vh] overflow-y-auto px-5 pb-4">
              {fixtures.length === 0 && (
                <div className="py-6 text-center text-xs text-zinc-500">
                  Patch fixtures first to edit scene values.
                </div>
              )}
              {groups.map(([group, groupFixtures]) => (
                <div key={group} className="mb-4">
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {group}
                  </h4>
                  <div className="flex flex-col gap-3">
                    {groupFixtures.map((fixture) => {
                      const values = editing.fixtureValues[fixture.id] ?? {}
                      const attrs = fixtureAttributes(fixture)
                      const hasColor =
                        attrs.includes('red') && attrs.includes('green') && attrs.includes('blue')
                      const extraAttrs = attrs.filter(
                        (a) => a !== 'intensity' && !(hasColor && ['red', 'green', 'blue'].includes(a))
                      )
                      return (
                        <div
                          key={fixture.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-200">
                              {fixture.name}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                              {fixture.type} · ch {fixture.channelStart}
                            </span>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            {attrs.includes('intensity') && (
                              <label className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                                  <span>Intensity</span>
                                  <span className="font-mono text-zinc-400">
                                    {values.intensity ?? 0}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={255}
                                  value={values.intensity ?? 0}
                                  onChange={(e) =>
                                    setEditingValue(fixture.id, 'intensity', Number(e.target.value))
                                  }
                                  className="accent-indigo-500"
                                />
                              </label>
                            )}

                            {hasColor && (
                              <div className="flex items-center gap-3">
                                <label className="flex flex-col gap-1">
                                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                                    Colour
                                  </span>
                                  <input
                                    type="color"
                                    value={toHex(values)}
                                    onChange={(e) =>
                                      setEditing((scene) =>
                                        scene
                                          ? {
                                              ...scene,
                                              fixtureValues: {
                                                ...scene.fixtureValues,
                                                [fixture.id]: applyHex(values, e.target.value)
                                              }
                                            }
                                          : scene
                                      )
                                    }
                                    className="h-8 w-12 cursor-pointer rounded border border-zinc-700 bg-transparent"
                                  />
                                </label>
                                <div className="flex flex-1 flex-col gap-1">
                                  {(['red', 'green', 'blue'] as const).map((channel) => (
                                    <label key={channel} className="flex items-center gap-2">
                                      <span
                                        className="w-8 text-[9px] uppercase"
                                        style={{
                                          color:
                                            channel === 'red'
                                              ? '#f87171'
                                              : channel === 'green'
                                                ? '#4ade80'
                                                : '#60a5fa'
                                        }}
                                      >
                                        {channel[0]}
                                      </span>
                                      <input
                                        type="range"
                                        min={0}
                                        max={255}
                                        value={values[channel] ?? 0}
                                        onChange={(e) =>
                                          setEditingValue(
                                            fixture.id,
                                            channel,
                                            Number(e.target.value)
                                          )
                                        }
                                        className="flex-1 accent-zinc-400"
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {extraAttrs.length > 0 && (
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {extraAttrs.map((attr) => (
                                <label key={attr} className="flex flex-col gap-1">
                                  <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                                    {attr}
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={255}
                                    value={values[attr] ?? 0}
                                    onChange={(e) =>
                                      setEditingValue(fixture.id, attr, Number(e.target.value))
                                    }
                                    className="rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3">
              <div className="flex items-center gap-4">
                <button
                  onClick={removeEditing}
                  className="text-xs text-zinc-500 hover:text-red-400"
                >
                  Delete scene
                </button>
                <button
                  onClick={() => {
                    if (!editing) return
                    duplicateScene(editing.id)
                    setEditing(null)
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-200"
                >
                  Duplicate
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(null)}
                  className="rounded bg-zinc-800 px-4 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditing}
                  className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  Save Scene
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
