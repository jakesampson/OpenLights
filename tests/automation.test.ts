import { describe, it, expect } from 'vitest'
import {
  computeAutomationChannels,
  computeSceneChannels,
  evaluateAutomation
} from '../src/renderer/src/lib/automationRuntime'
import type { AutomationDef, FixtureDef, SceneDef, ShowDef } from '../src/shared/types'

const par: FixtureDef = {
  id: 'f1',
  name: 'Front Par',
  type: 'par',
  channelStart: 1,
  channels: 4
}

const head: FixtureDef = {
  id: 'f2',
  name: 'Moving Head',
  type: 'moving-head',
  channelStart: 9,
  channels: 8
}

const fixtureList = [par, head]

function scene(fixtureValues: SceneDef['fixtureValues']): SceneDef {
  return { id: 's1', name: 'Test', fixtureValues, fadeMs: 0 }
}

describe('computeSceneChannels', () => {
  it('maps a fixture starting at channel 1 to channels 1-4 (no off-by-one)', () => {
    const channels = computeSceneChannels(
      fixtureList,
      scene({ f1: { intensity: 220, red: 255, green: 160, blue: 80 } })
    )
    expect(channels).toEqual({ 1: 220, 2: 255, 3: 160, 4: 80 })
  })

  it('maps moving-head attributes to their correct 1-based channels', () => {
    const channels = computeSceneChannels(
      fixtureList,
      scene({ f2: { intensity: 200, pan: 128, tilt: 96, red: 255, green: 255, blue: 255 } })
    )
    expect(channels).toEqual({ 9: 200, 10: 128, 11: 96, 12: 255, 13: 255, 14: 255 })
  })

  it('ignores unknown attributes and fixtures, clamps out-of-range values', () => {
    const channels = computeSceneChannels(
      fixtureList,
      scene({
        f1: { intensity: 999, strobe: 10 },
        ghost: { intensity: 255 }
      })
    )
    expect(channels).toEqual({ 1: 255 })
  })

  it('merges multiple fixtures in the same scene', () => {
    const channels = computeSceneChannels(
      fixtureList,
      scene({ f1: { intensity: 10 }, f2: { intensity: 20 } })
    )
    expect(channels).toEqual({ 1: 10, 9: 20 })
  })

  it('maps the ShowBuddy fixture profiles to the shown 1-based addresses', () => {
    const showBuddyFixtures: FixtureDef[] = [
      { id: 'bar', name: 'PAN bar', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 },
      { id: 'dimmer-1', name: 'Dimmer 1', type: 'dimmer', channelStart: 18, channels: 1 },
      { id: 'dimmer-2', name: 'Dimmer 2', type: 'dimmer', channelStart: 19, channels: 1 }
    ]
    const fixtureValues: SceneDef['fixtureValues'] = {
      bar: {
        red: 1,
        green: 2,
        blue: 3,
        red2: 4,
        green2: 5,
        blue2: 6,
        red3: 7,
        green3: 8,
        blue3: 9,
        red4: 10,
        green4: 11,
        blue4: 12,
        intensity: 13,
        strobe: 14,
        function: 15,
        speed: 16,
        listType: 17
      },
      'dimmer-1': { intensity: 18 },
      'dimmer-2': { intensity: 19 }
    }

    for (let index = 0; index < 4; index++) {
      const rgbaStart = 20 + index * 4
      const rgbaId = `rgba-${index + 1}`
      showBuddyFixtures.push({
        id: rgbaId,
        name: `Q12BT ${index + 1}`,
        type: 'rgba-4ch',
        channelStart: rgbaStart,
        channels: 4
      })
      fixtureValues[rgbaId] = {
        red: rgbaStart,
        green: rgbaStart + 1,
        blue: rgbaStart + 2,
        amber: rgbaStart + 3
      }

      const rgbwStart = 36 + index * 4
      const rgbwId = `rgbw-${index + 1}`
      showBuddyFixtures.push({
        id: rgbwId,
        name: `COREpar ${index + 1}`,
        type: 'rgbw-4ch',
        channelStart: rgbwStart,
        channels: 4
      })
      fixtureValues[rgbwId] = {
        red: rgbwStart,
        green: rgbwStart + 1,
        blue: rgbwStart + 2,
        white: rgbwStart + 3
      }
    }

    const channels = computeSceneChannels(showBuddyFixtures, scene(fixtureValues))

    expect(channels).toEqual(
      Object.fromEntries(Array.from({ length: 51 }, (_, index) => [index + 1, index + 1]))
    )
  })
})

describe('evaluateAutomation', () => {
  const auto: AutomationDef = {
    id: 'a1',
    name: 'Fade',
    fixtureId: 'f1',
    attribute: 'intensity',
    points: [
      { t: 0, v: 0 },
      { t: 10, v: 255 }
    ]
  }

  it('clamps outside the point range', () => {
    expect(evaluateAutomation(auto, -5)).toBe(0)
    expect(evaluateAutomation(auto, 20)).toBe(255)
  })

  it('interpolates linearly between points', () => {
    expect(evaluateAutomation(auto, 5)).toBe(128)
  })

  it('returns the single point value', () => {
    expect(evaluateAutomation({ ...auto, points: [{ t: 3, v: 77 }] }, 99)).toBe(77)
  })

  it('returns 0 for an empty point list', () => {
    expect(evaluateAutomation({ ...auto, points: [] }, 5)).toBe(0)
  })
})

describe('computeAutomationChannels', () => {
  const show: ShowDef = {
    id: 'show',
    name: 'Test show',
    createdAt: 0,
    updatedAt: 0,
    fixtures: fixtureList,
    scenes: [],
    automations: []
  }

  it('drives the correct 1-based channel for a fixture', () => {
    const automations: AutomationDef[] = [
      {
        id: 'a1',
        name: 'Head tilt',
        fixtureId: 'f2',
        attribute: 'tilt',
        points: [{ t: 0, v: 42 }]
      }
    ]
    expect(computeAutomationChannels(show, automations, 0)).toEqual({ 11: 42 })
  })

  it('lets the last automation win on a shared channel', () => {
    const automations: AutomationDef[] = [
      { id: 'a1', name: 'a', fixtureId: 'f1', attribute: 'intensity', points: [{ t: 0, v: 10 }] },
      { id: 'a2', name: 'b', fixtureId: 'f1', attribute: 'intensity', points: [{ t: 0, v: 99 }] }
    ]
    expect(computeAutomationChannels(show, automations, 0)).toEqual({ 1: 99 })
  })

  it('skips automations whose fixture or attribute is unknown', () => {
    const automations: AutomationDef[] = [
      { id: 'a1', name: 'missing fixture', fixtureId: 'nope', attribute: 'intensity', points: [{ t: 0, v: 50 }] },
      { id: 'a2', name: 'bad attr', fixtureId: 'f1', attribute: 'gobo', points: [{ t: 0, v: 50 }] }
    ]
    expect(computeAutomationChannels(show, automations, 0)).toEqual({})
  })
})
