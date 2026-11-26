import { describe, expect, it } from 'vitest'
import type { LivePage } from '../src/shared/types'
import {
  activeCueSequenceIds, activeLiveEffectIds, applyLiveDrop, decodeLiveDrop, dropLabel, emptyDropPayload,
  encodeLiveDrop, normalizeDropPayload, type LiveDropPayload
} from '../src/renderer/src/lib/liveDrops'
import { frameForCue } from '../src/renderer/src/lib/liveFrames'

function makePage(): LivePage {
  return {
    id: 'page',
    name: 'Page',
    controls: [
      { id: 'c1', name: 'Cue one', type: 'toggle', presetIds: ['p-old'], x: 600, y: 20 },
      { id: 'c2', name: 'Cue two', type: 'toggle', presetIds: [], x: 600, y: 120 }
    ],
    annotations: [
      { id: 'frame', type: 'frame', text: 'Frame', x: 200, y: 200, width: 300, height: 200 },
      { id: 'label', type: 'label', text: 'Label', x: 20, y: 440, width: 160, height: 40 }
    ]
  }
}

const payload = (overrides: Partial<LiveDropPayload> = {}): LiveDropPayload => ({
  presetIds: ['p1', 'p2'],
  sequenceIds: ['s1'],
  effectIds: [],
  presetNames: { p1: 'Blue', p2: 'Red' },
  sequenceNames: { s1: 'Chase' },
  ...overrides
})

let counter = 0
const makeId = () => `new-${++counter}`

describe('live drop payload encoding (7.10)', () => {
  it('round-trips a payload and deduplicates ids', () => {
    const encoded = encodeLiveDrop(payload({ presetIds: ['p1', 'p1', 'p2'], sequenceIds: ['s1', 's1'] }))
    expect(decodeLiveDrop(encoded)).toEqual(normalizeDropPayload(payload()))
  })

  it('rejects malformed or non-payload data', () => {
    expect(decodeLiveDrop('not json')).toBeNull()
    expect(decodeLiveDrop('{}')).toBeNull()
    expect(decodeLiveDrop('[]')).toBeNull()
    expect(decodeLiveDrop('{"presetIds":"p1","sequenceIds":[]}')).toBeNull()
  })

  it('ignores non-string ids and non-string names', () => {
    const decoded = decodeLiveDrop('{"presetIds":["p1",7,null],"sequenceIds":[],"presetNames":{"p1":"Blue","p2":9}}')
    expect(decoded?.presetIds).toEqual(['p1'])
    expect(decoded?.presetNames).toEqual({ p1: 'Blue' })
  })

  it('starts from an empty payload', () => {
    expect(emptyDropPayload()).toEqual({ presetIds: [], sequenceIds: [], effectIds: [] })
    expect(applyLiveDrop(makePage(), emptyDropPayload(), { kind: 'page', x: 100, y: 100 }, makeId).refs).toEqual([])
  })
})

describe('new cue labels (7.10)', () => {
  it('uses the item name for a single preset or sequence', () => {
    expect(dropLabel(payload({ presetIds: ['p1'], sequenceIds: [] }))).toBe('Blue')
    expect(dropLabel(payload({ presetIds: [], sequenceIds: ['s1'] }))).toBe('Chase')
    expect(dropLabel(payload({ presetIds: ['unknown'], sequenceIds: [] }))).toBe('Preset')
    expect(dropLabel(payload({ presetIds: [], sequenceIds: ['unknown'] }))).toBe('Sequence')
  })

  it('summarises multiple items and mixed drops', () => {
    expect(dropLabel(payload())).toBe('2 presets + 1 sequence')
    expect(dropLabel(payload({ presetIds: ['p1', 'p2', 'p3'], sequenceIds: [] }))).toBe('3 presets')
    expect(dropLabel(payload({ presetIds: [], sequenceIds: ['s1', 's2'] }))).toBe('2 sequences')
    expect(dropLabel(emptyDropPayload())).toBe('New cue')
  })
})

describe('dropping on a page (7.10)', () => {
  it('creates a snapped cue with the dragged presets and sequences', () => {
    const page = makePage()
    const { page: next, refs } = applyLiveDrop(page, payload({ presetIds: ['p1'], sequenceIds: ['s1'] }), { kind: 'page', x: 103, y: 207 }, makeId)
    expect(next.controls).toHaveLength(page.controls.length + 1)
    const cue = next.controls.at(-1)!
    expect(cue).toMatchObject({ id: 'new-1', name: '1 preset + 1 sequence', x: 100, y: 210, presetIds: ['p1'], sequenceIds: ['s1'] })
    expect(cue.style).toBeDefined()
    expect(refs).toEqual([{ type: 'cue', id: 'new-1' }])
    expect(page.controls).toHaveLength(2) // input left untouched
  })

  it('keeps every id from a multi-preset + sequence drop', () => {
    const { page } = applyLiveDrop(makePage(), payload(), { kind: 'page', x: 50, y: 50 }, makeId)
    expect(page.controls.at(-1)).toMatchObject({ presetIds: ['p1', 'p2'], sequenceIds: ['s1'], name: '2 presets + 1 sequence' })
  })

  it('does not modify the page for an empty payload', () => {
    const page = makePage()
    expect(applyLiveDrop(page, emptyDropPayload(), { kind: 'page', x: 0, y: 0 }, makeId).page).toBe(page)
  })

  it('creates one cue per dragged item when split is requested', () => {
    const { page, refs } = applyLiveDrop(makePage(), payload(), { kind: 'page', x: 100, y: 100 }, makeId, undefined, true)
    expect(page.controls).toHaveLength(5)
    expect(page.controls.slice(2).map((cue) => cue.name)).toEqual(['Blue', 'Red', 'Chase'])
    expect(page.controls.slice(2).map((cue) => cue.presetIds.length + (cue.sequenceIds ?? []).length)).toEqual([1, 1, 1])
    expect(refs).toEqual(page.controls.slice(2).map((cue) => ({ type: 'cue', id: cue.id })))
    expect(page.controls[3].x).toBe(230) // second item offset to the right (LIVE_CUE_STEP.x)
  })

  it('keeps all split cues inside a frame', () => {
    const page = makePage()
    page.annotations = [{ id: 'frame', type: 'frame', text: 'Frame', x: 100, y: 100, width: 200, height: 120 }]
    const { page: next } = applyLiveDrop(page, payload(), { kind: 'frame', frameId: 'frame', x: 140, y: 130 }, makeId, undefined, true)
    for (const cue of next.controls.slice(2)) expect(frameForCue(next, cue.id)).toBe('frame')
  })
})

describe('dropping on a frame (7.10)', () => {
  it('places the new cue so its centre stays inside the frame', () => {
    const { page } = applyLiveDrop(makePage(), payload(), { kind: 'frame', frameId: 'frame', x: 260, y: 260 }, makeId)
    const cue = page.controls.at(-1)!
    expect(frameForCue(page, cue.id)).toBe('frame')
  })

  it('clamps a far-away drop point into the frame', () => {
    const { page } = applyLiveDrop(makePage(), payload(), { kind: 'frame', frameId: 'frame', x: -500, y: -500 }, makeId)
    const cue = page.controls.at(-1)!
    expect(frameForCue(page, cue.id)).toBe('frame')
    expect(cue.x).toBeGreaterThanOrEqual(0)
    expect(cue.y).toBeGreaterThanOrEqual(0)
  })

  it('ignores an unknown frame id rather than dropping loose on the page', () => {
    const page = makePage()
    expect(applyLiveDrop(page, payload(), { kind: 'frame', frameId: 'missing', x: 100, y: 100 }, makeId).page).toBe(page)
  })

  it('ignores a label (only frame annotations accept drops)', () => {
    const page = makePage()
    expect(applyLiveDrop(page, payload(), { kind: 'frame', frameId: 'label', x: 100, y: 100 }, makeId).page).toBe(page)
  })
})

describe('dropping on a cue button (7.10)', () => {
  it('merges and deduplicates preset and sequence ids into the existing cue', () => {
    const { page, refs } = applyLiveDrop(makePage(), payload(), { kind: 'cue', cueId: 'c1' }, makeId)
    expect(page.controls).toHaveLength(2)
    expect(page.controls[0]).toMatchObject({ presetIds: ['p-old', 'p1', 'p2'], sequenceIds: ['s1'] })
    expect(refs).toEqual([{ type: 'cue', id: 'c1' }])
  })

  it('adds sequences without disturbing existing presets', () => {
    const { page } = applyLiveDrop(makePage(), payload({ presetIds: [], sequenceIds: ['s1', 's2'] }), { kind: 'cue', cueId: 'c2' }, makeId)
    expect(page.controls[1].presetIds).toEqual([])
    expect(page.controls[1].sequenceIds).toEqual(['s1', 's2'])
  })

  it('ignores an unknown cue id', () => {
    const page = makePage()
    expect(applyLiveDrop(page, payload(), { kind: 'cue', cueId: 'missing' }, makeId).page).toBe(page)
  })
})

describe('sequences started by active cues (7.10)', () => {
  it('collects sequence ids from lit cues on every page, deduplicated', () => {
    const first = applyLiveDrop(makePage(), payload({ presetIds: [], sequenceIds: ['s1'] }), { kind: 'cue', cueId: 'c1' }, makeId).page
    const second: LivePage = { id: 'other', name: 'Other', controls: [{ id: 'c3', name: 'Three', type: 'toggle', presetIds: [], sequenceIds: ['s2', 's1'] }] }
    expect(activeCueSequenceIds([first, second], { c1: 255, c2: 0, c3: 128 })).toEqual(['s1', 's2'])
    expect(activeCueSequenceIds([first, second], { c2: 255 })).toEqual([])
  })
})

describe('dropping an effect on a page (Jake, 26 Nov 2026)', () => {
  const effectPayload = (overrides: Partial<LiveDropPayload> = {}): LiveDropPayload => ({
    presetIds: [], sequenceIds: [], effectIds: ['kitt'], effectNames: { kitt: 'K.I.T.T.' }, ...overrides
  })

  it('round-trips an effect payload and decodes old payloads without effectIds', () => {
    expect(decodeLiveDrop(encodeLiveDrop(effectPayload()))).toMatchObject({ presetIds: [], sequenceIds: [], effectIds: ['kitt'], effectNames: { kitt: 'K.I.T.T.' } })
    expect(decodeLiveDrop(JSON.stringify({ presetIds: ['p1'], sequenceIds: [] }))).toMatchObject({ presetIds: ['p1'], effectIds: [] })
    expect(decodeLiveDrop(JSON.stringify({ presetIds: [], sequenceIds: [], effectIds: 'kitt' }))).toBeNull()
    expect(emptyDropPayload()).toEqual({ presetIds: [], sequenceIds: [], effectIds: [] })
  })

  it('labels a single effect button with the effect name', () => {
    expect(dropLabel(effectPayload())).toBe('K.I.T.T.')
    expect(dropLabel(effectPayload({ effectIds: ['a', 'b'] }))).toBe('2 effects')
  })

  it('creates a toggle button holding the effect, with LightKey 0.5s timing', () => {
    const { page, refs } = applyLiveDrop(makePage(), effectPayload(), { kind: 'page', x: 100, y: 100 }, makeId)
    expect(page.controls).toHaveLength(3)
    const control = page.controls[2]
    expect(control).toMatchObject({ name: 'K.I.T.T.', type: 'toggle', presetIds: [], sequenceIds: [], effectIds: ['kitt'] })
    expect(control.timing).toEqual({ fadeInMs: 500, fadeOutMs: 500, delayMs: 0, curve: 'linear' })
    expect(refs).toEqual([{ type: 'cue', id: control.id }])
  })

  it('does not give preset or sequence buttons the effect timing', () => {
    const { page } = applyLiveDrop(makePage(), payload(), { kind: 'page', x: 100, y: 100 }, makeId)
    expect(page.controls[2].timing).toBeUndefined()
  })

  it('creates one button per effect when split is requested', () => {
    const { page, refs } = applyLiveDrop(makePage(), effectPayload({ effectIds: ['e1', 'e2'], effectNames: { e1: 'One', e2: 'Two' } }), { kind: 'page', x: 100, y: 100 }, makeId, undefined, true)
    expect(page.controls).toHaveLength(4)
    expect(page.controls.slice(2).map((c) => c.name)).toEqual(['One', 'Two'])
    expect(page.controls.slice(2).map((c) => c.effectIds)).toEqual([['e1'], ['e2']])
    expect(refs).toHaveLength(2)
  })

  it('does nothing when an effect is dropped onto a cue button', () => {
    const page = makePage()
    expect(applyLiveDrop(page, effectPayload(), { kind: 'cue', cueId: 'c1' }, makeId).page).toBe(page)
  })
})

describe('effects run by active Live buttons (Jake, 26 Nov 2026)', () => {
  it('collects effect ids from lit buttons on every page, deduplicated', () => {
    const pages: LivePage[] = [
      { id: 'a', name: 'A', controls: [
        { id: 'b1', name: 'One', type: 'toggle', presetIds: [], effectIds: ['kitt'] },
        { id: 'b2', name: 'Two', type: 'toggle', presetIds: [], effectIds: [] }
      ] },
      { id: 'b', name: 'B', controls: [{ id: 'b3', name: 'Three', type: 'flash', presetIds: [], effectIds: ['kitt', 'chase'] }] }
    ]
    expect(activeLiveEffectIds(pages, { b1: 255, b2: 0, b3: 128 })).toEqual(['kitt', 'chase'])
    expect(activeLiveEffectIds(pages, { b1: 0, b3: 0 })).toEqual([])
    expect(activeLiveEffectIds(pages, { b2: 255 })).toEqual([])
  })
})
