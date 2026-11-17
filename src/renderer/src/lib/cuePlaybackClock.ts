import { useShowStore } from '../stores/showStore'

/** Keep cue timing independent of which editor or Live panel is mounted. */
export function startCuePlaybackClock(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let scheduled = ''
  const update = () => {
    const state = useShowStore.getState()
    const step = state.cueLists.find((list) => list.id === state.activeCueListId)?.steps[state.activeCueIndex]
    const valid = state.cuePlaying && step && Number.isFinite(step.holdMs) && step.holdMs > 0
    const key = valid ? `${state.cueRevision}:${state.activeCueListId}:${state.activeCueIndex}:${step.id}:${step.holdMs}` : ''
    if (key === scheduled) return
    if (timer !== null) clearTimeout(timer)
    timer = null
    scheduled = key
    if (!valid || !step) return
    timer = setTimeout(() => {
      timer = null
      const current = useShowStore.getState()
      if (current.cuePlaying && current.cueRevision === state.cueRevision && current.activeCueListId === state.activeCueListId && current.activeCueIndex === state.activeCueIndex) current.cueNext()
    }, step.holdMs)
  }
  const unsubscribe = useShowStore.subscribe(update)
  update()
  return () => { unsubscribe(); if (timer !== null) clearTimeout(timer) }
}
