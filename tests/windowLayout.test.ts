import { describe, expect, it } from 'vitest'
import { migrateShow } from '../src/shared/migrations'
describe('project window layout', () => {
  it('restores default panels for old projects and round trips hidden panels', () => {
    expect(migrateShow({}).layout).toEqual({ preview: true, palette: true, inspector: true })
    const show = migrateShow({ layout: { preview: false, palette: true, inspector: false } })
    expect(migrateShow(JSON.parse(JSON.stringify(show))).layout).toEqual(show.layout)
  })
})
