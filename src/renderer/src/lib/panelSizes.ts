// Panel sizes (Jake, 27 Nov 2026): the four main panels — Preview,
// Preset Palette, Shortcuts, and the Live/Design bottom panel — resize
// by dragging the dividers between them. Sizes are per-machine, so they
// live in localStorage, not in the show file (a show opened on another
// machine must not inherit this window's layout). The LightKey guide is
// silent on panel sizing — LightKey's own screenshots show fixed panels
// — so these are plain drag dividers on Jake's direct request, not a
// LightKey behaviour.
export interface PanelSizes {
  paletteWidth: number
  shortcutsWidth: number
  bottomHeight: number
}

export const PANEL_SIZE_DEFAULTS: PanelSizes = {
  paletteWidth: 260,
  shortcutsWidth: 260,
  bottomHeight: 294
}

export const PANEL_SIZE_LIMITS: Record<keyof PanelSizes, { min: number; max: number }> = {
  // The bottom panel holds the 34px Design/Live switch row plus the
  // 200px Live canvas floor, so it can never shrink below 240px; the
  // side panels keep enough room for a palette row / shortcut row.
  paletteWidth: { min: 200, max: 560 },
  shortcutsWidth: { min: 180, max: 560 },
  bottomHeight: { min: 240, max: 640 }
}

export const PANEL_SIZES_KEY = 'openlights.panelSizes'

type Viewport = { width: number; height: number }

/** Clamp one size to its limits, and to the window (a stored size from a
 *  bigger monitor must not swallow a smaller one — a side panel never
 *  takes more than half the window, and the bottom panel always leaves
 *  320px for the header + Preview). */
export function clampPanelSize(key: keyof PanelSizes, value: number, viewport?: Viewport): number {
  const { min, max } = PANEL_SIZE_LIMITS[key]
  let upper = max
  if (viewport) {
    if (key === 'bottomHeight') upper = Math.min(max, Math.max(min, viewport.height - 320))
    else upper = Math.min(max, Math.max(min, Math.floor(viewport.width / 2)))
  }
  if (!Number.isFinite(value)) return PANEL_SIZE_DEFAULTS[key]
  return Math.max(min, Math.min(upper, Math.round(value)))
}

export function clampPanelSizes(sizes: PanelSizes, viewport?: Viewport): PanelSizes {
  return {
    paletteWidth: clampPanelSize('paletteWidth', sizes.paletteWidth, viewport),
    shortcutsWidth: clampPanelSize('shortcutsWidth', sizes.shortcutsWidth, viewport),
    bottomHeight: clampPanelSize('bottomHeight', sizes.bottomHeight, viewport)
  }
}

interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Read the stored sizes, falling back to the defaults for anything
 *  missing, corrupt or out of range. A storage object is injected so
 *  the pure logic is testable outside a browser. */
export function loadPanelSizes(storage?: StorageLike | null, viewport?: Viewport): PanelSizes {
  let parsed: Partial<PanelSizes> = {}
  try {
    const raw = storage?.getItem(PANEL_SIZES_KEY)
    if (raw) {
      const value: unknown = JSON.parse(raw)
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) parsed = value as Partial<PanelSizes>
    }
  } catch { /* Corrupt JSON reads as defaults, never throws. */ }
  return clampPanelSizes({ ...PANEL_SIZE_DEFAULTS, ...parsed }, viewport)
}

export function savePanelSizes(sizes: PanelSizes, storage?: StorageLike | null): void {
  try {
    storage?.setItem(PANEL_SIZES_KEY, JSON.stringify(clampPanelSizes(sizes)))
  } catch { /* A full or unavailable store must not break the drag. */ }
}
