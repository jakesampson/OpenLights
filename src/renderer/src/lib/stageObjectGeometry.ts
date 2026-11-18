import type { StageObject } from '@shared/types'
export function sanitizeStageObjectPatch(patch: Partial<StageObject>): Partial<StageObject> {
  const result = { ...patch }
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'fontSize'] as const) {
    const value = result[key]
    if (value === undefined) continue
    if (!Number.isFinite(value)) { delete result[key]; continue }
    result[key] = key === 'width' || key === 'height' ? Math.max(4, value) : key === 'opacity' ? Math.max(0, Math.min(1, value)) : key === 'fontSize' ? Math.max(4, Math.min(200, value)) : value
  }
  return result
}
