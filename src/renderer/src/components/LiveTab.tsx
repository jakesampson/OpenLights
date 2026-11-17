import { useShowStore } from '../stores/showStore'
import { CueListPanel } from './CueListPanel'
import { SceneGrid } from './SceneGrid'

export function LiveTab() {
  const {
    scenes,
    cueLists,
    activeSceneId,
    activeCueListId,
    activeCueIndex,
    goToScene,
    goToCue
  } = useShowStore()

  return (
    <div className="flex flex-col gap-3 p-1">
      <section className="flex flex-col gap-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Scenes</h3>
        {scenes.length === 0 ? (
          <p className="py-2 text-xs text-dim">Create scenes in the management section below.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {scenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => goToScene(scene.id)}
                className={`pad rounded border border-line px-2 py-2 text-xs transition-colors ${
                  scene.id === activeSceneId
                    ? 'active'
                    : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'
                }`}
              >
                {scene.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Cue Lists</h3>
        {cueLists.length === 0 ? (
          <p className="py-2 text-xs text-dim">Create cue lists in the management section below.</p>
        ) : (
          cueLists.map((list) => (
            <div key={list.id} className="flex flex-col gap-1 rounded border border-line p-2">
              <h4 className="text-[10px] font-medium text-text">{list.name}</h4>
              {list.steps.length === 0 ? (
                <span className="text-[10px] text-dim">No cues yet</span>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {list.steps.map((step, index) => {
                    const sceneName = scenes.find((scene) => scene.id === step.sceneId)?.name
                    const active =
                      activeCueListId === list.id && activeCueIndex === index
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => goToCue(list.id, index)}
                        className={`pad rounded border border-line px-2 py-2 text-xs transition-colors ${
                          active
                            ? 'active'
                            : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'
                        }`}
                        title={`${sceneName ?? 'Missing scene'} · ${step.fadeMs}ms fade`}
                      >
                        <span className="block truncate">{sceneName ?? 'Missing scene'}</span>
                        <span className="text-[9px] opacity-70">Cue {index + 1}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </section>

      <details className="rounded-lg border border-line bg-panel p-2">
        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-dim">
          Manage scenes
        </summary>
        <div className="pt-3">
          <SceneGrid />
        </div>
      </details>
      <details className="rounded-lg border border-line bg-panel p-2">
        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-dim">
          Manage cue lists
        </summary>
        <div className="pt-3">
          <CueListPanel />
        </div>
      </details>
    </div>
  )
}