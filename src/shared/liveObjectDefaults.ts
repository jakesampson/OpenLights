/** Default and bounds for Live page object sizes (in page pixels). */
export const LIVE_CUE_SIZE = { width: 160, height: 90 }
export const LIVE_LIST_SIZE = { width: 240, height: 120 }
export const LIVE_LABEL_SIZE = { width: 160, height: 40 }
export const LIVE_FRAME_SIZE = { width: 360, height: 200 }

export const MIN_LIVE_OBJECT_SIZE = 40
export const MAX_LIVE_OBJECT_SIZE = 900

/** Clamp a resize dimension to the allowed range and snap to the 10px grid. */
export function clampLiveSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_LIVE_OBJECT_SIZE
  return Math.max(MIN_LIVE_OBJECT_SIZE, Math.min(MAX_LIVE_OBJECT_SIZE, Math.round(value / 10) * 10))
}

export const validLiveSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
