import { describe, expect, it } from 'vitest'
import type { LivePage } from '../src/shared/types'
import { orderedLiveControls } from '../src/renderer/src/lib/cuePriority'

const page: LivePage = { id: 'p', name: 'Page', controls: [{ id: 'a', name: 'A', type: 'push', presetIds: [] }, { id: 'b', name: 'B', type: 'push', presetIds: [] }] }
describe('cue priority', () => {
  it('puts the most recently activated cue last so it wins overlapping properties', () => expect(orderedLiveControls([page], { a: 255, b: 255 }, { a: 2, b: 5 }).map((cue) => cue.id)).toEqual(['a', 'b']))
  it('uses explicit priority before activation order', () => {
    page.controls[0].priority = 10
    expect(orderedLiveControls([page], { a: 255, b: 255 }, { a: 1, b: 9 }).map((cue) => cue.id)).toEqual(['b', 'a'])
  })
  it('treats an unset priority as LightKey\'s default 5 — Normal', () => {
    // The previous test left an explicit priority on the first control.
    delete page.controls[0].priority
    delete page.controls[1].priority
    // Both unset: tie, so activation order decides.
    expect(orderedLiveControls([page], { a: 255, b: 255 }, { a: 2, b: 5 }).map((cue) => cue.id)).toEqual(['a', 'b'])
    // 1 — Lowest loses to the unset (5) button, even when activated later.
    page.controls[0].priority = 1
    expect(orderedLiveControls([page], { a: 255, b: 255 }, { a: 9, b: 1 }).map((cue) => cue.id)).toEqual(['a', 'b'])
    // 9 — Highest beats the unset (5) button, even when activated first.
    page.controls[0].priority = 9
    expect(orderedLiveControls([page], { a: 255, b: 255 }, { a: 9, b: 1 }).map((cue) => cue.id)).toEqual(['b', 'a'])
  })
})
