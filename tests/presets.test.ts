import { describe, expect, it, vi } from 'vitest'
import { configurePresetOutput, sendImmediate, setEffectBlackout, suppressPresetsForCue } from '../src/renderer/src/lib/output'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { ShowDef } from '../src/shared/types'
const send = vi.fn()
vi.stubGlobal('window', { electronAPI: { setChannels: send } })
vi.stubGlobal('requestAnimationFrame', () => 1)
vi.stubGlobal('cancelAnimationFrame', () => {})
const last = () => send.mock.calls.at(-1)?.[0] as Record<number, number>

describe('preset layers', () => {
  it('captures selected fixture properties and persists them without altering the cue', () => {
    const show: ShowDef = { id: 'p', name: 'Test', createdAt: 0, updatedAt: 0, fixtures: [{ id: 'f', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }], cues: [{ id: 's', name: 'Look', fadeMs: 0, fixtureValues: { f: { intensity: 200, red: 100, green: 50, blue: 25 } } }], automations: [] }
    useShowStore.getState().setShow(show)
    useShowStore.getState().activateCue('s')
    useShowStore.getState().selectFixture('f')
    useShowStore.getState().capturePreset('Colour', 'color')
    const state = useShowStore.getState()
    expect(state.presets[0].fixtureValues).toEqual({ f: { red: 100, green: 50, blue: 25 } })
    expect(state.show?.presets).toEqual(state.presets)
    expect(state.cues[0].fixtureValues.f.intensity).toBe(200)
    state.togglePreset(state.presets[0].id)
    expect(useShowStore.getState().activePresetIds).toHaveLength(1)
    useShowStore.getState().setShow(show)
    expect(useShowStore.getState().activePresetIds).toEqual([])
  })
  it('suppresses active presets on a blackout cue and restores them on a normal cue', () => {
    const show: ShowDef = { id: 'b', name: 'Test', createdAt: 0, updatedAt: 0, fixtures: [{ id: 'f', name: 'Dimmer', type: 'dimmer', channelStart: 1, channels: 1 }], cues: [
      { id: 'on', name: 'On', fadeMs: 0, fixtureValues: { f: { intensity: 100 } } },
      { id: 'off', name: 'Blackout', fadeMs: 0, blackout: true, fixtureValues: {} }
    ], automations: [] }
    useShowStore.getState().setShow(show)
    useShowStore.getState().activateCue('on')
    configurePresetOutput({ 1: 200 })
    expect(last()[1]).toBe(200)
    useShowStore.getState().activateCue('off')
    expect(last()[1]).toBe(0)
    useShowStore.getState().activateCue('on')
    expect(last()[1]).toBe(200)
    configurePresetOutput({})
  })

  it('overlays and releases values while honoring blackout', () => {
    setEffectBlackout(false)
    suppressPresetsForCue(false)
    configurePresetOutput({})
    sendImmediate({ 1: 100, 2: 40 })
    configurePresetOutput({ 2: 200, 3: 50 })
    expect(last()).toMatchObject({ 1: 100, 2: 200, 3: 50 })
    configurePresetOutput({})
    expect(last()).toMatchObject({ 1: 100, 2: 40, 3: 0 })
    configurePresetOutput({ 2: 200 })
    setEffectBlackout(true)
    sendImmediate({ 1: 0, 2: 0 })
    expect(last()[2]).toBe(0)
    setEffectBlackout(false)
    suppressPresetsForCue(false)
    configurePresetOutput({})
  })
})
