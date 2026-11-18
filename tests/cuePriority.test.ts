import { describe, expect, it } from 'vitest'
import type { LivePage } from '../src/shared/types'
import { orderedLiveControls } from '../src/renderer/src/lib/cuePriority'

const page: LivePage = { id: 'p', name: 'Page', controls: [{ id: 'a', name: 'A', type: 'toggle', presetIds: [] }, { id: 'b', name: 'B', type: 'toggle', presetIds: [] }] }
describe('cue priority', () => {
  it('puts the most recently activated cue last so it wins overlapping properties', () => expect(orderedLiveControls([page], { a: 255, b: 255 }, { a: 2, b: 5 }).map((cue) => cue.id)).toEqual(['a', 'b']))
  it('uses explicit priority before activation order', () => {
    page.controls[0].priority = 10
    expect(orderedLiveControls([page], { a: 255, b: 255 }, { a: 1, b: 9 }).map((cue) => cue.id)).toEqual(['b', 'a'])
  })
})
