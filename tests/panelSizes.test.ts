// Jake, 27 Nov 2026 — the four main panels resize by dragging the
// dividers between them; sizes persist per-machine in localStorage, not
// in the show file.
import { describe, expect, it } from 'vitest'
import {
  PANEL_SIZE_DEFAULTS, PANEL_SIZE_LIMITS, PANEL_SIZES_KEY,
  clampPanelSize, clampPanelSizes, loadPanelSizes, savePanelSizes
} from '../src/renderer/src/lib/panelSizes'

const memoryStorage = (initial?: Record<string, string>) => {
  const store = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    raw: () => store.get(PANEL_SIZES_KEY)
  }
}

describe('panel sizes', () => {
  it('defaults to the current layout when nothing is stored', () => {
    expect(loadPanelSizes(memoryStorage())).toEqual(PANEL_SIZE_DEFAULTS)
    expect(PANEL_SIZE_DEFAULTS).toEqual({ paletteWidth: 260, shortcutsWidth: 260, bottomHeight: 294 })
  })

  it('reads stored sizes and ignores unknown keys', () => {
    const storage = memoryStorage({ [PANEL_SIZES_KEY]: JSON.stringify({ paletteWidth: 320, shortcutsWidth: 200, bottomHeight: 400, bogus: 99 }) })
    expect(loadPanelSizes(storage)).toEqual({ paletteWidth: 320, shortcutsWidth: 200, bottomHeight: 400 })
  })

  it('falls back to defaults on corrupt or non-object JSON', () => {
    expect(loadPanelSizes(memoryStorage({ [PANEL_SIZES_KEY]: 'not json' }))).toEqual(PANEL_SIZE_DEFAULTS)
    expect(loadPanelSizes(memoryStorage({ [PANEL_SIZES_KEY]: '"a string"' }))).toEqual(PANEL_SIZE_DEFAULTS)
    expect(loadPanelSizes(memoryStorage({ [PANEL_SIZES_KEY]: '[1,2]' }))).toEqual(PANEL_SIZE_DEFAULTS)
    expect(loadPanelSizes(null)).toEqual(PANEL_SIZE_DEFAULTS)
  })

  it('clamps every size to its min and max', () => {
    expect(clampPanelSize('paletteWidth', 0)).toBe(PANEL_SIZE_LIMITS.paletteWidth.min)
    expect(clampPanelSize('paletteWidth', 9999)).toBe(PANEL_SIZE_LIMITS.paletteWidth.max)
    expect(clampPanelSize('shortcutsWidth', 0)).toBe(PANEL_SIZE_LIMITS.shortcutsWidth.min)
    expect(clampPanelSize('bottomHeight', 0)).toBe(PANEL_SIZE_LIMITS.bottomHeight.min)
    expect(clampPanelSize('bottomHeight', 9999)).toBe(PANEL_SIZE_LIMITS.bottomHeight.max)
    expect(clampPanelSize('paletteWidth', Number.NaN)).toBe(PANEL_SIZE_DEFAULTS.paletteWidth)
    expect(clampPanelSizes({ paletteWidth: 1, shortcutsWidth: 9999, bottomHeight: 1 })).toEqual({
      paletteWidth: PANEL_SIZE_LIMITS.paletteWidth.min,
      shortcutsWidth: PANEL_SIZE_LIMITS.shortcutsWidth.max,
      bottomHeight: PANEL_SIZE_LIMITS.bottomHeight.min
    })
  })

  it('clamps to the window as well as the absolute limits', () => {
    // A small laptop (1024x640): side panels never take more than half
    // the width, and the bottom panel always leaves 320px for the header
    // + Preview.
    expect(clampPanelSize('paletteWidth', 560, { width: 1024, height: 640 })).toBe(512)
    expect(clampPanelSize('bottomHeight', 640, { width: 1024, height: 640 })).toBe(320)
    expect(clampPanelSize('bottomHeight', 300, { width: 1392, height: 1050 })).toBe(300)
  })

  it('round-trips through storage', () => {
    const storage = memoryStorage()
    savePanelSizes({ paletteWidth: 300, shortcutsWidth: 220, bottomHeight: 350 }, storage)
    expect(loadPanelSizes(storage)).toEqual({ paletteWidth: 300, shortcutsWidth: 220, bottomHeight: 350 })
    expect(JSON.parse(storage.raw()!)).toEqual({ paletteWidth: 300, shortcutsWidth: 220, bottomHeight: 350 })
  })

  it('a failing store never throws', () => {
    const broken = {
      getItem: () => { throw new Error('no storage') },
      setItem: () => { throw new Error('no storage') }
    }
    expect(loadPanelSizes(broken)).toEqual(PANEL_SIZE_DEFAULTS)
    expect(() => savePanelSizes(PANEL_SIZE_DEFAULTS, broken)).not.toThrow()
  })
})
