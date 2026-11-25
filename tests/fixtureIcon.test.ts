// Preview fixture icons vary by fixture type, like LightKey (Guide
// p.32). The kind resolves from OFL categories first, then the
// profile's legacy type, then the fixture's own type.
import { describe, it, expect } from 'vitest'
import { fixtureIconKind } from '../src/renderer/src/lib/fixtureIcon'
import type { FixtureDef, FixtureProfile } from '../src/shared/types'

function fixture(partial: Partial<FixtureDef>): FixtureDef {
  return { id: 'f1', name: 'F1', type: 'par', channelStart: 1, channels: 1, ...partial }
}

function profile(partial: Partial<FixtureProfile>): FixtureProfile {
  return { id: 'p1', name: 'P1', manufacturer: 'M', legacyType: 'par', modes: [], ...partial }
}

describe('fixtureIconKind', () => {
  it.each([
    ['moving-head', 'moving-head'],
    ['par', 'par'],
    ['led-wash', 'wash'],
    ['rgba-4ch', 'wash'],
    ['rgbw-4ch', 'wash'],
    ['dimmer', 'bulb'],
    ['generic-led', 'generic'],
    ['pixel-bar-17ch', 'led-bar']
  ] as const)('maps FixtureType %s to %s', (type, kind) => {
    expect(fixtureIconKind(fixture({ type }))).toBe(kind)
  })

  it('prefers the profile legacy type over the fixture type', () => {
    expect(fixtureIconKind(fixture({ type: 'dimmer', profile: profile({ legacyType: 'moving-head' }) }))).toBe('moving-head')
  })

  it('switches an LED bar between its strip icons (Guide p.56 — line or ring)', () => {
    const bar = fixture({ type: 'pixel-bar-17ch' })
    expect(fixtureIconKind(bar)).toBe('led-bar')
    expect(fixtureIconKind({ ...bar, ledIconShape: 'line' })).toBe('led-strip-open')
    expect(fixtureIconKind({ ...bar, ledIconShape: 'ring' })).toBe('led-strip-closed')
    // The shape only applies to LED bars — other fixtures ignore it.
    expect(fixtureIconKind(fixture({ type: 'par', ledIconShape: 'line' }))).toBe('par')
  })

  it('prefers OFL categories over the profile type — a wash and a PAR can share a channel profile', () => {
    const wash = fixture({
      type: 'par',
      profile: profile({ legacyType: 'par', ofl: { manufacturerKey: 'm', fixtureKey: 'f', source: { categories: ['Wash'] } } })
    })
    expect(fixtureIconKind(wash)).toBe('wash')
    const changer = fixture({
      type: 'led-wash',
      profile: profile({ legacyType: 'led-wash', ofl: { manufacturerKey: 'm', fixtureKey: 'f', source: { categories: ['Color Changer'] } } })
    })
    expect(fixtureIconKind(changer)).toBe('par')
  })

  it.each([
    [['Moving Head'], 'moving-head'],
    [['Scanner'], 'moving-head'],
    [['Strobe'], 'strobe'],
    [['Blinder'], 'blinder'],
    [['Fog'], 'fog'],
    [['Matrix'], 'led-matrix'],
    [['Pixel Bar'], 'led-bar'],
    [['Bar'], 'led-bar'],
    [['Laser'], 'generic'],
    [['Panel'], 'panel']
  ] as const)('maps OFL category %s to %s', (categories, kind) => {
    const f = fixture({
      type: 'par',
      profile: profile({ ofl: { manufacturerKey: 'm', fixtureKey: 'f', source: { categories: [...categories] } } })
    })
    expect(fixtureIconKind(f)).toBe(kind)
  })

  it('falls back to the generic square when nothing matches', () => {
    expect(fixtureIconKind(fixture({ type: 'nope' as FixtureDef['type'] }))).toBe('generic')
  })

  it('ignores a missing OFL source and uses the type instead', () => {
    const f = fixture({ type: 'moving-head', profile: profile({ legacyType: 'moving-head', ofl: { manufacturerKey: 'm', fixtureKey: 'f' } }) })
    expect(fixtureIconKind(f)).toBe('moving-head')
  })
})
