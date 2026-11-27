import { useLayoutEffect, useState, type RefObject } from 'react'

// Jake, 26 Nov 2026 — a right-click menu opened at the raw click point
// ran off the bottom / right of the window when the click was near an
// edge (Live canvas menu: New Button / New Cue List / Insert Text / Insert Cuelist /
// Cut / Copy — the items below the fold could not be seen or clicked).
// Every menu positioned at a click point must land fully inside the
// viewport instead: flip it above / to the left of the click when there
// is not enough room below / to the right. This is the one shared
// implementation — the palette menu, the effect-template menu and the
// sample menu each had their own copy of the same math before.

export const MENU_VIEWPORT_MARGIN = 8

/** Which side a fly-out submenu opens on (Jake, 27 Nov 2026 — LightKey's
 *  cue-button submenus pop out sideways): right of its parent item,
 *  unless it would run off the viewport, when it opens to the left.
 *  When neither side fits, it opens on the side with more room. */
export function flyoutSide(parentLeft: number, parentRight: number, submenuWidth: number, viewportWidth = window.innerWidth, margin = MENU_VIEWPORT_MARGIN): 'right' | 'left' {
  if (parentRight + submenuWidth + margin <= viewportWidth) return 'right'
  if (parentLeft - submenuWidth - margin >= 0) return 'left'
  return viewportWidth - parentRight >= parentLeft ? 'right' : 'left'
}

/** Vertical shift (px, never positive) to pull a fly-out submenu back
 *  inside the viewport: up when it runs off the bottom, never above the
 *  top margin. */
export function flyoutTopShift(submenuTop: number, submenuBottom: number, viewportHeight = window.innerHeight, margin = MENU_VIEWPORT_MARGIN): number {
  return Math.max(margin - submenuTop, Math.min(0, viewportHeight - margin - submenuBottom))
}

/**
 * Clamp a menu's top-left corner so the whole menu stays inside the
 * viewport. The menu opens at the click point when there is room;
 * otherwise it is pulled back so its far edge sits `margin` inside the
 * window. When the menu is taller (or wider) than the viewport it
 * cannot fit at all — then it starts at the top (left) margin, which
 * at least keeps its first items reachable.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
  margin = MENU_VIEWPORT_MARGIN,
): { left: number; top: number } {
  return {
    left: Math.max(margin, Math.min(x, viewportWidth - menuWidth - margin)),
    top: Math.max(margin, Math.min(y, viewportHeight - menuHeight - margin)),
  }
}

/**
 * Measure the mounted menu and clamp it into the viewport. The menu
 * first renders at the click point, then the layout effect re-positions
 * it once its real size is known — the same pattern the palette and
 * effect-template menus used inline before this helper existed.
 */
export function useClampedMenuPosition(
  x: number,
  y: number,
  ref: RefObject<HTMLElement | null>,
): { left: number; top: number } {
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos(clampMenuPosition(x, y, rect.width, rect.height))
  }, [x, y, ref])
  return pos
}
