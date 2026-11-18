import type { ShowDef } from '@shared/types'
export function hasUnsavedChanges(show: ShowDef | null, saved: string): boolean { return Boolean(show && JSON.stringify(show) !== saved) }
export function transitionDecision(dirty: boolean, choice?: 'save' | 'discard' | 'cancel', saveSucceeded = false): 'prompt' | 'proceed' | 'stay' {
  if (!dirty || choice === 'discard') return 'proceed'
  if (!choice) return 'prompt'
  return choice === 'save' && saveSucceeded ? 'proceed' : 'stay'
}
