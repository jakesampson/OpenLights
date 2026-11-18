import { describe, expect, it } from 'vitest'
import type { LivePage } from '../src/shared/types'
import { stepFrame } from '../src/renderer/src/lib/frameStepping'

const page: LivePage = { id: 'p', name: 'P', controls: [{ id: 'a', name: 'A', type: 'toggle', presetIds: [], x: 20, y: 20 }, { id: 'b', name: 'B', type: 'toggle', presetIds: [], x: 200, y: 20 }, { id: 'next', name: 'Next', type: 'toggle', presetIds: [], x: 20, y: 120, frameStep: 'next' }], annotations: [{ id: 'f', type: 'frame', text: 'F', x: 0, y: 0, width: 400, height: 250 }] }
describe('frame stepping', () => {
  it('steps next and previous among frame cues but excludes step buttons', () => {
    expect(stepFrame(page, 'f', { a: 255 }, 1)).toEqual({ b: 255 })
    expect(stepFrame(page, 'f', { a: 255 }, -1)).toEqual({ b: 255 })
    expect(stepFrame(page, 'f', { b: 255, outside: 10 }, 1)).toEqual({ outside: 10, a: 255 })
  })
})
