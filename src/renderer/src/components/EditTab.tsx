import { SceneGrid } from './SceneGrid'
import { CueListPanel } from './CueListPanel'
import { PresetEditor } from './PresetEditor'
import { SequenceEditor } from './SequenceEditor'

export function EditTab() {
  return <div className="flex flex-col gap-3 p-1">
    <p className="text-xs text-dim">Manage scenes and cue lists. Select a scene to recall it; use Edit to change its values.</p>
    <PresetEditor />
    <SequenceEditor />
    <SceneGrid />
    <details className="rounded-lg border border-line bg-panel p-3">
      <summary className="cursor-pointer text-xs font-semibold">Manage cue lists</summary>
      <div className="pt-3"><CueListPanel /></div>
    </details>
  </div>
}
