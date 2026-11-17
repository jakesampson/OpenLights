import type { FrameConfig, LivePage } from '@shared/types'
import { frameConfigFor, LIVE_CUE_SIZE } from '@shared/liveObjectDefaults'

interface Bounds { x: number; y: number; width: number; height: number }
interface Point { x: number; y: number }

const frameBounds = (page: LivePage, frameId: string): Bounds | null => {
  const frame = page.annotations?.find((a) => a.id === frameId && a.type === 'frame')
  return frame ? { x: frame.x, y: frame.y, width: frame.width, height: frame.height } : null
}

/** Centre point of a cue, used to decide which frame contains it. */
const cueCenter = (page: LivePage, cueId: string): Point | null => {
  const cue = page.controls.find((c) => c.id === cueId)
  if (!cue) return null
  return {
    x: (cue.x ?? 0) + (cue.width ?? LIVE_CUE_SIZE.width) / 2,
    y: (cue.y ?? 0) + (cue.height ?? LIVE_CUE_SIZE.height) / 2
  }
}

const within = (point: Point, bounds: Bounds): boolean =>
  point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y && point.y <= bounds.y + bounds.height

/** The first frame (document order) whose bounds contain the cue's centre. */
export function frameForCue(page: LivePage, cueId: string): string | null {
  const center = cueCenter(page, cueId)
  if (!center) return null
  const frame = (page.annotations ?? []).find(
    (a) => a.type === 'frame' && within(center, { x: a.x, y: a.y, width: a.width, height: a.height })
  )
  return frame?.id ?? null
}

/** Cue ids whose centre lies inside the given frame. */
export function frameMembers(page: LivePage, frameId: string): string[] {
  const bounds = frameBounds(page, frameId)
  if (!bounds) return []
  return page.controls.filter((cue) => {
    const center = cueCenter(page, cue.id)
    return center ? within(center, bounds) : false
  }).map((cue) => cue.id)
}

export function frameConfig(page: LivePage, frameId: string): FrameConfig | undefined {
  return page.annotations?.find((a) => a.id === frameId && a.type === 'frame')?.frame
}

/** Patch a frame's configuration immutably, re-applying defaults and clamping. */
export function setFrameConfig(page: LivePage, frameId: string, patch: Partial<FrameConfig>): LivePage {
  return {
    ...page,
    annotations: page.annotations?.map((a) => a.id === frameId && a.type === 'frame'
      ? { ...a, frame: frameConfigFor({ ...frameConfigFor(a.frame), ...patch }) }
      : a)
  }
}

/** In an exclusive frame, the other cues that release when this cue activates. */
export function exclusiveSiblings(page: LivePage, cueId: string): string[] {
  const frameId = frameForCue(page, cueId)
  if (!frameId) return []
  if (frameConfigFor(frameConfig(page, frameId)).exclusive !== true) return []
  return frameMembers(page, frameId).filter((id) => id !== cueId)
}

/** Intensity multiplier (0–2) contributed by the cue's frame. */
export function frameIntensity(page: LivePage, cueId: string): number {
  const frameId = frameForCue(page, cueId)
  return frameId ? frameConfigFor(frameConfig(page, frameId)).intensity / 100 : 1
}

/** Speed multiplier (0–2) contributed by the cue's frame. */
export function frameSpeed(page: LivePage, cueId: string): number {
  const frameId = frameForCue(page, cueId)
  return frameId ? frameConfigFor(frameConfig(page, frameId)).speed / 100 : 1
}

/** Apply a frame's intensity modifier to a cue's 0–255 level. */
export function effectiveLiveLevel(page: LivePage, cueId: string, level: number): number {
  return Math.max(0, Math.min(255, level * frameIntensity(page, cueId)))
}

/**
 * Live output levels with each cue's frame intensity modifier applied. Cue ids
 * not found on any page pass through unchanged (levels can outlive a page).
 */
export function liveOutputLevels(
  pages: LivePage[] | undefined,
  active: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [id, level] of Object.entries(active)) {
    const page = (pages ?? []).find((candidate) => candidate.controls.some((cue) => cue.id === id))
    result[id] = page ? effectiveLiveLevel(page, id, level) : level
  }
  return result
}

/**
 * Speed modifiers scale the fade used when switching to a page: a frame running
 * at 200% halves the fade, 50% doubles it. The slowest active frame governs.
 * Frames at the default 100% leave the fade unchanged, so existing shows are
 * unaffected.
 */
export function liveFadeMs(
  page: LivePage | undefined,
  outputLevels: Record<string, number>,
  pageFadeMs: number
): number {
  if (!page || pageFadeMs <= 0) return pageFadeMs
  const speeds: number[] = []
  for (const cue of page.controls) {
    if (!(outputLevels[cue.id] > 0)) continue
    if (!frameForCue(page, cue.id)) continue
    const speed = frameSpeed(page, cue.id)
    if (speed > 0) speeds.push(speed)
  }
  if (!speeds.length) return pageFadeMs
  return Math.max(0, Math.round(pageFadeMs / Math.min(...speeds)))
}
