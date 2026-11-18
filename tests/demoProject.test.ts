import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ShowDef } from '../src/shared/types'

const demoProject = JSON.parse(
  readFileSync(join(process.cwd(), 'demo-projects', 'ShowBuddyActive-Demo.json'), 'utf8')
) as ShowDef

describe('ShowBuddyActive demo project', () => {
  it('patches all pictured fixtures contiguously from channel 1, left to right', () => {
    const fixtures = demoProject.fixtures

    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      'pan-4x1x30',
      'dimmer-1',
      'dimmer-2',
      'simger-q12bt-1',
      'simger-q12bt-2',
      'simger-q12bt-3',
      'simger-q12bt-4',
      'corepar-q120-1',
      'corepar-q120-2',
      'corepar-q120-3',
      'corepar-q120-4'
    ])
    expect(fixtures[0].channelStart).toBe(1)

    for (let index = 1; index < fixtures.length; index++) {
      const previous = fixtures[index - 1]
      const current = fixtures[index]
      expect(current.channelStart).toBe(previous.channelStart + previous.channels)
      expect(current.previewPosition?.x).toBeGreaterThan(previous.previewPosition?.x ?? -1)
    }

    const finalFixture = fixtures[fixtures.length - 1]
    expect(finalFixture.channelStart + finalFixture.channels - 1).toBe(51)
  })

  it('includes cue values for every fixture', () => {
    const fixtureIds = demoProject.fixtures.map((fixture) => fixture.id)

    expect(demoProject.cues.length).toBeGreaterThan(0)
    for (const cue of demoProject.cues) {
      expect(Object.keys(cue.fixtureValues).sort()).toEqual([...fixtureIds].sort())
    }
  })
})
