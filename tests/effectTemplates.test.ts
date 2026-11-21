// LightKey's built-in effect templates (Guide ch.10, p.148): the real
// template names, kinds and beat flags from Jake's LightKey screenshots
// (21 Nov 2026, 9.15.56 / 9.16.05 / 9.16.22 pm), and the effects the
// chooser builds from them.
import { describe, expect, it } from 'vitest'
import {
  ALL_LIGHTKEY_TEMPLATES,
  EFFECT_TEMPLATE_SECTIONS,
  createEffectFromTemplate,
  findLightKeyTemplate
} from '../src/renderer/src/lib/effectTemplates'

describe('LightKey effect templates', () => {
  it('lists the templates from Jake’s screenshots, grouped by property', () => {
    expect(EFFECT_TEMPLATE_SECTIONS.map((s) => [s.label, s.templates.length])).toEqual([
      ['Dimmer', 18],
      ['Color', 26],
      ['Position', 18],
      ['Zoom', 4],
      ['Iris', 5]
    ])
    expect(ALL_LIGHTKEY_TEMPLATES).toHaveLength(71)
    expect(new Set(ALL_LIGHTKEY_TEMPLATES.map((t) => t.name)).size).toBe(71)
    expect(new Set(ALL_LIGHTKEY_TEMPLATES.map((t) => t.id)).size).toBe(71)
  })

  it('marks only the beat-controlled templates with the pulse icon', () => {
    const beat = ALL_LIGHTKEY_TEMPLATES.filter((t) => t.beat).map((t) => t.name)
    expect(beat).toEqual(['Beat Meteor', 'Beat Strike', 'Beat Flash', 'Beat Flash ×4', 'Beat Comet'])
  })

  it('gives Dimmer pattern tiles to the first nine and curve tiles to the last nine', () => {
    const dimmer = EFFECT_TEMPLATE_SECTIONS[0].templates
    expect(dimmer.slice(0, 9).every((t) => t.kind === 'pattern')).toBe(true)
    expect(dimmer.slice(9).every((t) => t.kind === 'curve')).toBe(true)
    expect(dimmer[0].name).toBe('Barn Doors')
    expect(dimmer[8].name).toBe('Shades')
    expect(dimmer[9].name).toBe('Beat Flash')
    expect(dimmer[17].name).toBe('Venetian Blinds')
  })

  it('gives Color pattern tiles to the first twenty-one and curve tiles to the last five', () => {
    const color = EFFECT_TEMPLATE_SECTIONS[1].templates
    expect(color.slice(0, 21).every((t) => t.kind === 'pattern')).toBe(true)
    expect(color.slice(21).every((t) => t.kind === 'curve')).toBe(true)
    expect(color[0].name).toBe('Beat Comet')
    expect(color[11].name).toBe('K.I.T.T.')
    expect(color[21].name).toBe('Birthday Party')
    expect(color[25].name).toBe('Treasure Flower')
  })

  it('gives Position movement tiles to the first fourteen and curve tiles to the last four', () => {
    const position = EFFECT_TEMPLATE_SECTIONS[2].templates
    expect(position.slice(0, 14).every((t) => t.kind === 'movement')).toBe(true)
    expect(position.slice(14).every((t) => t.kind === 'curve')).toBe(true)
    expect(position[0].name).toBe('Bow Tie')
    expect(position[13].name).toBe('Zigzag 5')
    expect(position[14].name).toBe('Ballyhoo (Mirrored)')
    expect(position[17].name).toBe('Wiper')
  })

  it('builds a pattern effect with the template’s samples', () => {
    const rain = createEffectFromTemplate(findLightKeyTemplate('builtin-dimmer-rain')!, ['fx1'])
    expect(rain.kind).toBe('pattern')
    expect(rain.pattern).toBe('rain')
    expect(rain.attribute).toBe('intensity')
    expect(rain.name).toBe('Rain')
    expect(rain.samples).toEqual([
      { id: 'sample-bg', value: 0 },
      { id: 'sample-1', value: 100 }
    ])
    const kitt = createEffectFromTemplate(findLightKeyTemplate('builtin-color-k-i-t-t')!, ['fx1'])
    expect(kitt.pattern).toBe('scanner')
    expect(kitt.attribute).toBe('color')
    expect(kitt.samples?.[1]?.color).toBe('#ff0000')
  })

  it('builds a beat effect with the template’s multiplier', () => {
    const flash = createEffectFromTemplate(findLightKeyTemplate('builtin-dimmer-beat-flash-4')!, ['fx1'])
    expect(flash.kind).toBe('curve')
    expect(flash.timingMode).toBe('beat')
    expect(flash.beatMultiplier).toBe(4)
  })

  it('builds a movement effect on the template’s path', () => {
    const bowTie = createEffectFromTemplate(findLightKeyTemplate('builtin-position-bow-tie')!, ['fx1'])
    expect(bowTie.kind).toBe('movement')
    expect(bowTie.attribute).toBe('position')
    expect(bowTie.movementPathId).toBe('builtin-bow-tie')
  })

  it('gives Iris five curve tiles from Jake’s screenshot', () => {
    // 21 Nov 2026, 10.20.06 pm: Fireworks, Iris Alternating, Iris
    // Closing, Iris Opening, Iris Wave — the same line-icon shapes as
    // Zoom, so the same curve mappings.
    const iris = EFFECT_TEMPLATE_SECTIONS[4].templates
    expect(iris.map((t) => t.name)).toEqual([
      'Fireworks',
      'Iris Alternating',
      'Iris Closing',
      'Iris Opening',
      'Iris Wave'
    ])
    expect(iris.every((t) => t.kind === 'curve')).toBe(true)
    // Fireworks is a burst-then-fade curve (see the comment in
    // effectTemplates.ts) — flag for Jake to confirm it isn't a pattern.
    expect(iris[0].curveComponents?.[0].points.map((p) => [p.x, p.y])).toEqual([[0, 1], [0.5, 0], [1, 0]])
    expect(iris[2].curveComponents?.[0].points.map((p) => [p.x, p.y])).toEqual([[0, 1], [1, 0]])
    expect(iris[3].curveComponents?.[0].points.map((p) => [p.x, p.y])).toEqual([[0, 0], [1, 1]])
  })

  it('builds an iris curve effect with one iris curve', () => {
    const wave = createEffectFromTemplate(findLightKeyTemplate('builtin-iris-wave')!, ['fx1'])
    expect(wave.kind).toBe('curve')
    expect(wave.attribute).toBe('iris')
    expect(wave.name).toBe('Iris Wave')
    expect(wave.curveComponents?.map((c) => c.component)).toEqual(['iris'])
  })

  it('builds a colour curve effect with one curve per component', () => {
    const rainbow = createEffectFromTemplate(findLightKeyTemplate('builtin-color-rainbow')!, ['fx1'])
    expect(rainbow.kind).toBe('curve')
    expect(rainbow.curveComponents?.map((c) => c.component)).toEqual(['hue', 'saturation', 'brightness'])
  })

  it('builds the Ballyhoo variants with their fixture orders', () => {
    const mirrored = createEffectFromTemplate(findLightKeyTemplate('builtin-position-ballyhoo-mirrored')!, ['fx1'])
    expect(mirrored.mirrorPan).toBe(true)
    const random = createEffectFromTemplate(findLightKeyTemplate('builtin-position-ballyhoo-random')!, ['fx1'])
    expect(random.fixtureOrder).toBe('random-fixed')
  })
})
