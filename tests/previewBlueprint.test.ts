import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { previewSpacePan } from '../src/renderer/src/lib/previewSpacePan'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

const storeSource = readFileSync('src/renderer/src/stores/showStore.ts', 'utf8')
const appSource = readFileSync('src/renderer/src/App.tsx', 'utf8')
const previewSource = readFileSync('src/renderer/src/components/StagePreview.tsx', 'utf8')
const panelSource = readFileSync('src/renderer/src/components/PreviewEditPanel.tsx', 'utf8')
const objectsSource = readFileSync('src/renderer/src/components/StageObjects.tsx', 'utf8')

describe('blueprint scrollable canvas (LightKey Guide p.53, Jake 19 Nov 2026)', () => {
  it('shows the blueprint grid in edit mode and a blank window otherwise', () => {
    // Grid colours sampled from Jake's LightKey screenshot
    // (Screenshot_2026-11-19_at_8.54.17_am.png): background #496077,
    // minor lines #64788b every 60 units, major lines #8090a0 every 240.
    expect(previewSource).toContain('id="blueprintGrid"')
    expect(previewSource).toContain('id="blueprintGridMajor"')
    expect(previewSource).toContain('#496077')
    expect(previewSource).toContain('#64788b')
    expect(previewSource).toContain('#8090a0')
    expect(previewSource).toContain('fill="url(#blueprintGrid)"')
    expect(previewSource).toContain('fill="url(#blueprintGridMajor)"')
    // The grid rects only render while editing; the canvas rect itself
    // is transparent, so preview mode is a blank window.
    expect(previewSource).toContain("{editing && <rect x={viewCentre.x - 400 / zoom} y={viewCentre.y - 170 / zoom} width={800 / zoom} height={340 / zoom} fill=\"url(#blueprintGrid)\"")
    expect(previewSource).toContain('fill="transparent"')
    // The default stage background is gone: no glow, deck, performer
    // silhouettes, demo arc or DEMO RIG label.
    expect(previewSource).not.toContain('stageGlow')
    expect(previewSource).not.toContain('Stage deck')
    expect(previewSource).not.toContain('Performer silhouettes')
    expect(previewSource).not.toContain('DEMO RIG')
    expect(previewSource).not.toContain('original illustration')
  })

  it('pans on two-finger scroll and zooms on pinch / Ctrl+scroll', () => {
    // preventDefault needs a non-passive listener — React's onWheel is
    // passive, so the canvas attaches its own.
    expect(previewSource).toContain("addEventListener('wheel', onWheel, { passive: false })")
    expect(previewSource).toContain('event.ctrlKey || event.metaKey')
    expect(previewSource).toContain('Two-finger scroll pans in all directions')
    expect(previewSource).toContain('setViewCentre({ x: view.viewCentre.x + event.deltaX * scale')
  })

  it('pans on a blank drag, except marquee in edit mode (Guide p.53)', () => {
    // Guide p.53 settles it: blank drag is marquee selection in edit
    // mode ("press the mouse button over a blank part of the Preview and
    // drag it over the objects"), Space+drag pans, and scroll moves the
    // visible area when enlarged. So a blank drag pans only where there
    // is no marquee — outside edit mode — or with Space held in edit mode.
    expect(previewSource).toContain('panRef.current = { startClient')
    expect(previewSource).toContain('previewSpacePan.held && editing')
    expect(previewSource).toContain('setMarquee({ start, current: start, additive: event.shiftKey })')
    // Space is also the Go shortcut, so holding it over the Preview in
    // edit mode must not fire Go — the flag is set on a capture-phase
    // listener (so it runs before App's bubble-phase key handler) and
    // App reads it in the Go branch.
    expect(previewSource).toContain("event.code !== 'Space'")
    expect(previewSource).toContain('capture: true')
    expect(previewSpacePan.held).toBe(false)
    expect(appSource).toContain('previewSpacePan.held')
    // A plain click on blank canvas still deselects in preview mode.
    expect(previewSource).toContain('if (!pan.moved && !editing) selectFixtures([])')
  })

  it('keeps the canvas clean: edit tools live in the side panel', () => {
    // Nothing editing-related overlays the canvas any more — only the
    // Preview label and the zoom cluster remain on it.
    expect(previewSource).not.toContain('+ Add truss')
    expect(previewSource).not.toContain('Align / distribute')
    expect(previewSource).not.toContain('Truss properties')
    expect(previewSource).not.toContain('Fixture storage')
    expect(previewSource).not.toContain('StageObjectTools')
    expect(previewSource).toContain('>Preview</span>')
    expect(previewSource).toContain('Zoom out preview')
    // The side panel becomes the Inspector in Design edit mode.
    expect(appSource).toContain("tab === 'Design' && previewEditing ? <PreviewEditPanel />")
    expect(appSource).toContain("aria-label={tab === 'Design' && previewEditing ? 'Preview inspector' : 'Preset palette sidebar'}")
    // The panel holds the shape tools, layout tools, truss/fixture
    // properties and the storage tray.
    expect(panelSource).toContain('StageObjectTools')
    expect(panelSource).toContain('variant="panel"')
    expect(panelSource).toContain('+ Add truss')
    expect(panelSource).toContain('Select all')
    expect(panelSource).toContain('Align / distribute')
    expect(panelSource).toContain('Truss properties')
    expect(panelSource).toContain('Fixture properties')
    expect(panelSource).toContain('Fixture storage')
    expect(panelSource).toContain('id="fixture-storage-tray"')
    // Align is dispatched to the canvas (it needs the live fixture
    // positions); the canvas listens for it.
    expect(panelSource).toContain("openlights-preview-align")
    expect(previewSource).toContain("window.addEventListener('openlights-preview-align', handler)")
    // The shape tools support both placements.
    expect(objectsSource).toContain("variant?: 'overlay' | 'panel'")
  })

  it('holds preview selection in the store, session-only like previewEditing', () => {
    expect(storeSource).toContain('selectedPreviewTrussId: string | null')
    expect(storeSource).toContain('setSelectedPreviewTrussId: (value: string | null) => void')
    expect(storeSource).toContain('selectedLayoutTrussIds: string[]')
    expect(storeSource).toContain('selectedStageObjectId: string | null')
    const s = () => useShowStore.getState()
    s().setSelectedPreviewTrussId('truss-1')
    s().setSelectedLayoutTrussIds(['truss-1'])
    s().setSelectedStageObjectId('shape-1')
    expect(s().selectedPreviewTrussId).toBe('truss-1')
    expect(s().selectedLayoutTrussIds).toEqual(['truss-1'])
    expect(s().selectedStageObjectId).toBe('shape-1')
    // Loading a show resets the selection, like the edit modes.
    s().setShow(migrateShow({ fixtures: [] }))
    expect(s().selectedPreviewTrussId).toBeNull()
    expect(s().selectedLayoutTrussIds).toEqual([])
    expect(s().selectedStageObjectId).toBeNull()
  })
})
