import { describe, expect, it, vi } from 'vitest'
import { sanitizeStageObjectPatch } from '../src/renderer/src/lib/stageObjectGeometry'
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

it('copies independent identities, flips, orders and undoes batch commands', () => {
 const state = () => useShowStore.getState(); state().setShow(migrateShow({ stageObjects: [object] }))
 state().copyStageObjects(['o']); const ids = state().pasteStageObjects()
 expect(ids[0]).not.toBe('o'); expect(state().show!.stageObjects![1].x).toBe(30)
 state().updateStageObject(ids[0], { name: 'Independent' }); expect(state().show!.stageObjects![0].name).toBe('Stage')
 state().flipStageObjects(ids, 'x'); expect(state().show!.stageObjects![1].flipX).toBe(true); state().undo(); expect(state().show!.stageObjects![1].flipX).toBeUndefined()
 state().orderStageObjects(ids, 'back'); expect(state().show!.stageObjects![0].id).toBe(ids[0]); state().undo(); expect(state().show!.stageObjects![0].id).toBe('o')
 const copies = state().duplicateStageObjects(['o']); expect(copies[0]).not.toBe(ids[0]); state().undo(); expect(state().show!.stageObjects).toHaveLength(2)
})
