import { useEffect, useState } from 'react'
import { useShowStore } from '../stores/showStore'

export function CueListPanel() {
  const {
    scenes,
    cueLists,
    activeCueListId,
    activeCueIndex,
    cuePlaying,
    setActiveCueList,
    addCueList,
    updateCueList,
    renameCueList,
    removeCueList,
    addCueStep,
    updateCueStep,
    removeCueStep,
    moveCueStep,
    goToCue,
    cueNext,
    cuePrev,
    stopCue
  } = useShowStore()

  const [newSceneId, setNewSceneId] = useState<string>('')
  const activeList = cueLists.find((list) => list.id === activeCueListId) ?? null
  const currentStep = activeList?.steps[activeCueIndex]

  useEffect(() => {
    if (!newSceneId && scenes[0]) setNewSceneId(scenes[0].id)
    if (newSceneId && !scenes.some((s) => s.id === newSceneId)) {
      setNewSceneId(scenes[0]?.id ?? '')
    }
  }, [scenes, newSceneId])

  // Auto-advance through cues after their hold time.
  useEffect(() => {
    if (!cuePlaying || !currentStep || currentStep.holdMs <= 0) return
    const timer = window.setTimeout(() => cueNext(), currentStep.holdMs)
    return () => window.clearTimeout(timer)
  }, [cuePlaying, currentStep?.id, currentStep?.holdMs, cueNext])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
          Cue Lists
        </h2>
        <button
          onClick={() => addCueList()}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          + New Cue List
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-2">
          {cueLists.length === 0 && (
            <div className="px-3 py-4 text-xs text-zinc-500">No cue lists yet.</div>
          )}
          {cueLists.map((list) => (
            <button
              key={list.id}
              onClick={() => setActiveCueList(list.id)}
              className={`rounded px-3 py-2 text-left text-xs transition-colors ${
                list.id === activeCueListId
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <span className="block font-medium">{list.name}</span>
              <span
                className={`text-[10px] ${
                  list.id === activeCueListId ? 'text-indigo-200' : 'text-zinc-500'
                }`}
              >
                {list.steps.length} cue{list.steps.length === 1 ? '' : 's'}
                {list.loop ? ' · loop' : ''}
              </span>
            </button>
          ))}
        </div>

        {!activeList ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-10 text-xs text-zinc-500">
            Create a cue list to arrange scenes into a running order.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <input
                value={activeList.name}
                onChange={(e) => renameCueList(activeList.id, e.target.value)}
                className="w-52 rounded bg-zinc-800 px-3 py-1.5 text-sm text-white"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={activeList.loop ?? false}
                  onChange={(e) => updateCueList(activeList.id, { loop: e.target.checked })}
                />
                Loop
              </label>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => goToCue(activeList.id, 0)}
                  disabled={activeList.steps.length === 0}
                  className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  ▶ Go
                </button>
                <button
                  onClick={cuePrev}
                  disabled={activeList.steps.length === 0}
                  className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                >
                  ⏮ Prev
                </button>
                <button
                  onClick={cueNext}
                  disabled={activeList.steps.length === 0}
                  className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                >
                  Next ⏭
                </button>
                <button
                  onClick={stopCue}
                  className={`rounded px-3 py-1.5 text-xs font-medium ${
                    cuePlaying
                      ? 'bg-red-600/80 text-white hover:bg-red-500'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  ⏹ Stop
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete cue list “${activeList.name}”?`)) removeCueList(activeList.id)
                  }}
                  className="text-[10px] text-zinc-500 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/60 text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="w-10 px-3 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Scene</th>
                    <th className="px-2 py-2 font-medium">Fade (ms)</th>
                    <th className="px-2 py-2 font-medium">Hold (ms)</th>
                    <th className="px-2 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {activeList.steps.map((step, index) => {
                    const isCurrent = cuePlaying && index === activeCueIndex
                    return (
                      <tr
                        key={step.id}
                        className={isCurrent ? 'bg-emerald-500/10' : 'hover:bg-zinc-800/30'}
                      >
                        <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                          {isCurrent ? '▶' : index + 1}
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={step.sceneId}
                            onChange={(e) =>
                              updateCueStep(activeList.id, step.id, { sceneId: e.target.value })
                            }
                            className="w-48 rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                          >
                            {scenes.map((scene) => (
                              <option key={scene.id} value={scene.id}>
                                {scene.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={step.fadeMs}
                            onChange={(e) =>
                              updateCueStep(activeList.id, step.id, {
                                fadeMs: Number(e.target.value)
                              })
                            }
                            className="w-24 rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={500}
                            value={step.holdMs}
                            onChange={(e) =>
                              updateCueStep(activeList.id, step.id, {
                                holdMs: Number(e.target.value)
                              })
                            }
                            className="w-24 rounded bg-zinc-800 px-2 py-1 text-xs text-white"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => goToCue(activeList.id, index)}
                              className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700"
                            >
                              Go
                            </button>
                            <button
                              onClick={() => moveCueStep(activeList.id, step.id, -1)}
                              disabled={index === 0}
                              className="text-[10px] text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveCueStep(activeList.id, step.id, 1)}
                              disabled={index === activeList.steps.length - 1}
                              className="text-[10px] text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => removeCueStep(activeList.id, step.id)}
                              className="text-[10px] text-zinc-500 hover:text-red-400"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {activeList.steps.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-xs text-zinc-500">
                        No cues yet — add a scene below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <select
                value={newSceneId}
                onChange={(e) => setNewSceneId(e.target.value)}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white"
              >
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => addCueStep(activeList.id, newSceneId || undefined)}
                disabled={scenes.length === 0}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
              >
                + Add Cue
              </button>
              <span className="text-[10px] text-zinc-500">
                Hold = auto-advance delay. Set 0 for manual Next / MIDI Next.
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
