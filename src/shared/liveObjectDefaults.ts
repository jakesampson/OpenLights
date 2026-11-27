import type { FrameConfig, LiveDefaultStyles, LiveObjectKind, LiveObjectStyle } from './types'

/** Default and bounds for Live page object sizes (in page pixels). */
export const LIVE_CUE_SIZE = { width: 120, height: 40 }
/** Placement pitch for new cue buttons (LightKey: 132x48px pitch, 13px
 *  gaps — Jake's screenshot 22 Nov 2026: 238x70 device px at 2x, i.e.
 *  119x35 CSS px buttons, 264 device px column pitch, 96 device px row
 *  pitch. 120x40 is the nearest 10px-grid step; the pitch leaves the
 *  same ~10px gaps LightKey does. */
export const LIVE_CUE_STEP = { x: 130, y: 50 }
export const LIVE_LIST_SIZE = { width: 240, height: 240 }
export const LIVE_LABEL_SIZE = { width: 160, height: 40 }
export const LIVE_FRAME_SIZE = { width: 360, height: 200 }

/** Default size of a Live fader control (Jake's LightKey screenshots,
 *  27 Nov 2026 — the Spots Left/Right faders are tall narrow tracks,
 *  roughly 1:3; the horizontal fader is the same track turned
 *  sideways). A fader's size is its track length, and it is resizable
 *  with the 8-handle affordance like any other control. */
export const LIVE_FADER_VERTICAL_SIZE = { width: 56, height: 180 }
export const LIVE_FADER_HORIZONTAL_SIZE = { width: 180, height: 56 }

export const MIN_LIVE_OBJECT_SIZE = 40
export const MAX_LIVE_OBJECT_SIZE = 900

/** Live canvas size, in page pixels. */
export interface LiveCanvasBounds { width: number; height: number }
/** The classic Live canvas: 900 wide, 520 tall (Jake, 22 Nov 2026).
 *  The width is still the canvas minimum — the canvas was always a
 *  900-wide sheet — but the height was always the panel height (the
 *  canvas renders h-full inside the 294px bottom panel), so the height
 *  minimum is just the visible viewport. Neither is a maximum any
 *  more: the canvas grows past both as objects approach an edge
 *  (Jake, 25 Nov 2026 — infinitely scrollable, expanding on demand). */
export const DEFAULT_LIVE_CANVAS_BOUNDS: LiveCanvasBounds = { width: 900, height: 520 }
/** Breathing room past the furthest object's edge when the canvas
 *  grows — the new area always has room for the object plus a margin,
 *  so a button dropped near the edge is never half off the canvas. */
export const LIVE_CANVAS_GROW_MARGIN = 20
/** Snap a canvas coordinate to the 10px grid; never below 0, and with
 *  no ceiling — a position past the old edge grows the canvas instead
 *  of being clamped back (Jake, 25 Nov 2026). */
export const snapCanvasValue = (value: number): number => Math.max(0, Math.round(value / 10) * 10)
/** Size a canvas so it covers the visible viewport and every object
 *  rect, with breathing room past the furthest edge. The width never
 *  shrinks below the classic 900; the height never shrinks below the
 *  viewport. There is no maximum — drop or drag an object near an
 *  edge and the next size includes it, so the scroll container lets
 *  the user scroll into the new area, and the canvas keeps growing
 *  as needed. */
export function canvasSizeFor(
  viewport: LiveCanvasBounds,
  rects: { x: number; y: number; width: number; height: number }[]
): LiveCanvasBounds {
  return {
    width: Math.max(DEFAULT_LIVE_CANVAS_BOUNDS.width, viewport.width, ...rects.map((r) => r.x + r.width + LIVE_CANVAS_GROW_MARGIN)),
    height: Math.max(viewport.height, ...rects.map((r) => r.y + r.height + LIVE_CANVAS_GROW_MARGIN))
  }
}

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
