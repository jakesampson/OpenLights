import { describe, expect, it, vi } from 'vitest'
import { resizeStageObject, sanitizeStageObjectPatch } from '../src/renderer/src/lib/stageObjectGeometry'
import { migrateShow } from '../src/shared/migrations'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { StageObject } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('cancelAnimationFrame', vi.fn())
const object: StageObject = { id: 'o', name: 'Stage', kind: 'rectangle', x: 10, y: 10, width: 100, height: 50, rotation: 0 }
describe('stage object migration and editing', () => {
  it('keeps every original truss field and leaves the legacy collection intact', () => {
    const truss = { id: 't', name: 'Truss', shape: 'u', x: 1, y: 2, width: 300, height: 100, rotation: 180, extra: 'preserve' }
    const show = migrateShow({ previewTrusses: [truss] })
    expect(show.previewTrusses).toEqual([truss])
    expect(show.stageObjects![0]).toMatchObject({ ...truss, kind: 'truss', trussShape: 'u' })
    expect(migrateShow(JSON.parse(JSON.stringify(show)))).toEqual(show)
  })
  it('undoes CRUD and synchronizes truss edits with the legacy representation', () => {
    const state = () => useShowStore.getState(); state().setShow(migrateShow({}))
    state().addStageObject(object); expect(state().show!.stageObjects).toEqual([object]); state().undo(); expect(state().show!.stageObjects).toEqual([]); state().redo()
    state().updateStageObject('o', { x: 200 }); expect(state().show!.stageObjects![0].x).toBe(200); state().undo(); expect(state().show!.stageObjects![0].x).toBe(10)
    state().removeStageObjects(['o']); expect(state().show!.stageObjects).toEqual([]); state().undo(); expect(state().show!.stageObjects).toEqual([object])
    state().setPreviewTrusses([{ id: 't', name: 'U', shape: 'u', x: 0, y: 0, width: 100, height: 20, rotation: 0 }]); state().updateStageObject('t', { x: 300 }); expect(state().show!.previewTrusses![0].x).toBe(300)
  })
})

it('validates numeric style and geometry edits without allowing invalid rendering values', () => {
 expect(sanitizeStageObjectPatch({ width: -10, height: 0, opacity: 4, x: NaN, fontSize: 500 })).toEqual({ width: 4, height: 4, opacity: 1, fontSize: 200 })
 expect(sanitizeStageObjectPatch({ text: 'Stage', fill: '#abcdef' })).toEqual({ text: 'Stage', fill: '#abcdef' })
})

describe('corner resize of stage objects (Jake, 27 Nov 2026)', () => {
  const image: StageObject = { id: 'img', name: 'Auditorium', kind: 'image', x: 400, y: 170, width: 120, height: 60, rotation: 0, imageSrc: 'data:image/png;base64,x' }
  it('scales uniformly by default and keeps the opposite corner fixed', () => {
    // SE corner dragged out by (12, 6): scale 1.1, so 132×66.
    const next = resizeStageObject(image, 'se', { x: 472, y: 206 }, false)
    expect(next).toMatchObject({ x: 406, y: 173, width: 132, height: 66 })
    // The NW corner stays at (340, 140).
    expect(next.x - next.width / 2).toBe(340)
    expect(next.y - next.height / 2).toBe(140)
  })
  it('resizes the NW corner the same way, mirrored', () => {
    const next = resizeStageObject(image, 'nw', { x: 328, y: 134 }, false)
    expect(next).toMatchObject({ x: 394, y: 167, width: 132, height: 66 })
    expect(next.x + next.width / 2).toBe(460)
    expect(next.y + next.height / 2).toBe(200)
  })
  it('stretches freely with Shift — width and height move independently', () => {
    const next = resizeStageObject(image, 'se', { x: 472, y: 200 }, true)
    expect(next).toMatchObject({ x: 406, y: 170, width: 132, height: 60 })
  })
  it('honours rotation — the drag is measured in the object’s own axes', () => {
    const rotated = { ...image, rotation: 90 }
    // Local (72, 36) is canvas (364, 242) at 90°; scale 1.1 again.
    const next = resizeStageObject(rotated, 'se', { x: 364, y: 242 }, false)
    expect(next).toMatchObject({ x: 397, y: 176, width: 132, height: 66 })
    // The NW corner stays at canvas (430, 110).
    expect(Math.round(next.x + 33)).toBe(430)
    expect(Math.round(next.y - 66)).toBe(110)
  })
  it('honours a horizontal flip — the grabbed corner is the visual one', () => {
    const flipped = { ...image, flipX: true }
    // Local (72, 36) is canvas (328, 206) when flipped.
    const next = resizeStageObject(flipped, 'se', { x: 328, y: 206 }, false)
    expect(next).toMatchObject({ x: 394, y: 173, width: 132, height: 66 })
    expect(next.x + next.width / 2).toBe(460)
    expect(next.y - next.height / 2).toBe(140)
  })
  it('never collapses below the 4-unit minimum', () => {
    const next = resizeStageObject(image, 'se', { x: 340, y: 140 }, true)
    expect(next.width).toBe(4)
    expect(next.height).toBe(4)
  })
})

it('copies independent identities, flips, orders and undoes batch commands', () => {
 const state = () => useShowStore.getState(); state().setShow(migrateShow({ stageObjects: [object] }))
 state().copyStageObjects(['o']); const ids = state().pasteStageObjects()
 expect(ids[0]).not.toBe('o'); expect(state().show!.stageObjects![1].x).toBe(30)
 state().updateStageObject(ids[0], { name: 'Independent' }); expect(state().show!.stageObjects![0].name).toBe('Stage')
 state().flipStageObjects(ids, 'x'); expect(state().show!.stageObjects![1].flipX).toBe(true); state().undo(); expect(state().show!.stageObjects![1].flipX).toBeUndefined()
 state().orderStageObjects(ids, 'back'); expect(state().show!.stageObjects![0].id).toBe(ids[0]); state().undo(); expect(state().show!.stageObjects![0].id).toBe('o')
 const copies = state().duplicateStageObjects(['o']); expect(copies[0]).not.toBe(ids[0]); state().undo(); expect(state().show!.stageObjects).toHaveLength(2)
})
