// Plain-click fixture selection (Jake, 26 Nov 2026): 1 click selects
// the fixture's group, clicking the same fixture again while its group
// is selected singles that fixture out. Shift-click toggles one
// fixture at a time in the Preview itself (not this helper).
import { describe, expect, it } from 'vitest'
import { resolveFixtureClickSelection } from '../src/renderer/src/lib/fixtureGroups'
import type { FixtureGroup } from '../src/shared/types'

const groups: FixtureGroup[] = [
  { id: 'g-front', name: 'Front', parentId: null, fixtureIds: ['f1', 'f2', 'f3'] },
  { id: 'g-left', name: 'Front Left', parentId: 'g-front', fixtureIds: ['f1', 'f2'] },
  { id: 'g-back', name: 'Back', parentId: null, fixtureIds: ['b1', 'b2'] },
  { id: 'g-ungrouped', name: 'Ungrouped', parentId: null, fixtureIds: ['u1'] },
]

describe('resolveFixtureClickSelection', () => {
  it('selects the whole group on first click', () => {
    expect(resolveFixtureClickSelection(groups, 'f3', [])).toEqual(['f1', 'f2', 'f3'])
    expect(resolveFixtureClickSelection(groups, 'b1', [])).toEqual(['b1', 'b2'])
  })

  it('resolves a fixture in two groups to the smallest direct group', () => {
    // f1 is a direct member of both Front (f1, f2, f3) and Front Left
    // (f1, f2): the click takes the smaller one.
    expect(resolveFixtureClickSelection(groups, 'f1', [])).toEqual(['f1', 'f2'])
  })

  it('singles the fixture out on a second click while its group is selected', () => {
    expect(resolveFixtureClickSelection(groups, 'f1', ['f1', 'f2'])).toEqual(['f1'])
    expect(resolveFixtureClickSelection(groups, 'f3', ['f1', 'f2', 'f3'])).toEqual(['f3'])
  })

  it('singles out even when the selection holds the group plus extras', () => {
    expect(resolveFixtureClickSelection(groups, 'b1', ['b1', 'b2', 'f1'])).toEqual(['b1'])
  })

  it('selects the group when only part of it is selected', () => {
    expect(resolveFixtureClickSelection(groups, 'f3', ['f1'])).toEqual(['f1', 'f2', 'f3'])
  })

  it('treats the Ungrouped record as no group', () => {
    expect(resolveFixtureClickSelection(groups, 'u1', [])).toEqual(['u1'])
    expect(resolveFixtureClickSelection(groups, 'u1', ['u1'])).toEqual(['u1'])
  })

  it('selects just a fixture in no group at all', () => {
    expect(resolveFixtureClickSelection(groups, 'x1', [])).toEqual(['x1'])
  })
})
