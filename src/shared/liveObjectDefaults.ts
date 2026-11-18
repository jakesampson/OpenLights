import type { FrameConfig, LiveDefaultStyles, LiveObjectKind, LiveObjectStyle } from './types'

/** Default and bounds for Live page object sizes (in page pixels). */
export const LIVE_CUE_SIZE = { width: 160, height: 90 }
export const LIVE_LIST_SIZE = { width: 240, height: 150 }
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

/** Built-in text styles applied to new objects when a page has no override. */
export const DEFAULT_OBJECT_STYLES: Record<LiveObjectKind, LiveObjectStyle> = {
  cue: { fontSize: 12, bold: false, italic: false, color: '#e5e7eb', align: 'center' },
  list: { fontSize: 12, bold: false, italic: false, color: '#e5e7eb', align: 'left' },
  label: { fontSize: 14, bold: false, italic: false, color: '#9ca3af', align: 'left' },
  frame: { fontSize: 14, bold: false, italic: false, color: '#9ca3af', align: 'left' }
}

/** Merge built-in defaults, a page's configurable defaults and an object's own style. */
export function styleFor(
  kind: LiveObjectKind,
  style: LiveObjectStyle | undefined,
  pageDefaults?: LiveDefaultStyles
): LiveObjectStyle {
  return { ...DEFAULT_OBJECT_STYLES[kind], ...pageDefaults?.[kind], ...style }
}

/** Built-in frame configuration; a frame with no config behaves as a normal group. */
export const DEFAULT_FRAME_CONFIG: Required<FrameConfig> = { exclusive: false, intensity: 100, speed: 100 }

/** Clamp a modifier percentage into the supported 0–200 range. */
export function clampModifier(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.max(0, Math.min(200, Math.round(value)))
}

/** Merge built-in frame defaults with a frame's own configuration. */
export function frameConfigFor(config: FrameConfig | undefined): Required<FrameConfig> {
  return {
    ...DEFAULT_FRAME_CONFIG,
    ...config,
    intensity: clampModifier(config?.intensity ?? 100),
    speed: clampModifier(config?.speed ?? 100)
  }
}
