// @vitest-environment jsdom
// Shutter/Strobe + Auto Program Design panels (LightKey Guide pp.97–98,
// 110–111, 314; Jake's screenshot 19 Nov 2026). Renders the real
// DesignTab with synthetic shows and asserts the panels' presence,
// wiring and values — including that a fixture without those channels
// shows no panels at all, and that a slot-less strobe byte stays a raw
// fader instead of getting a panel it cannot drive.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore, findInlineCue } from '../src/renderer/src/stores/showStore'
import type { FixtureChannel, FixtureDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RECT = { left: 0, top: 0, width: 150, height: 150, right: 150, bottom: 150, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

let container: HTMLDivElement | undefined
let root: Root | undefined

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  root = createRoot(el)
  act(() => { root.render(node) })
  return el
}

function click(el: HTMLElement) {
  act(() => { el.click() })
}

function keydown(el: HTMLElement, key: string, init: Partial<KeyboardEventInit> = {}) {
  act(() => { el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })) })
}

function pointerdown(el: HTMLElement) {
  act(() => { el.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5, button: 0, buttons: 1, pointerId: 1 })) })
}

function ch(number: number, attribute: string, slots?: FixtureChannel['slots'], control?: FixtureChannel['control']): FixtureChannel {
  return {
    number,
    attribute,
    propertyType: attribute === 'intensity' ? 'intensity' : /^(red|green|blue)$/.test(attribute) ? 'color' : 'other',
    min: 0,
    max: 255,
    defaultValue: 0,
    highlightValue: 0,
    control: control ?? (slots ? 'options' : 'slider'),
    slots
  }
}

function slot(id: string, name: string, from: number, to: number, capabilityType: string): NonNullable<FixtureChannel['slots']>[number] {
  return { id, name, from, to, kind: 'slot', capabilityType }
}

function profileFixture(id: string, channels: FixtureChannel[]): FixtureDef {
  return {
    id,
    name: `Test ${id}`,
    type: 'led-wash',
    channelStart: 1,
    channels: channels.length,
    profile: { id: `test-${id}`, name: `Test ${id}`, manufacturer: 'Test', legacyType: 'led-wash', modes: [{ id: 'default', name: 'Default', channels }] }
  }
}

// Rogue R3 Spot strobe ranges (manual): Off 0–3, On 4–7, Synchronising
// 8–76, Pulse 77–145, Random 146–215, On 216–255.
const R3 = profileFixture('r3', [
  ch(0, 'intensity'), ch(1, 'red'), ch(2, 'green'), ch(3, 'blue'),
  ch(4, 'Strobe', [
    slot('off', 'Off', 0, 3, 'ShutterStrobe'),
    slot('on', 'On', 4, 7, 'ShutterStrobe'),
    slot('sync', 'Synchronizing strobe, slow to fast', 8, 76, 'ShutterStrobe'),
    slot('pulse', 'Pulse strobe, slow to fast', 77, 145, 'ShutterStrobe'),
    slot('random', 'Random strobe, slow to fast', 146, 215, 'ShutterStrobe'),
    slot('on2', 'On', 216, 255, 'ShutterStrobe')
  ])
])

// EP4 (Jake's bar, manual Ch14–16): Strobe OFF 0–9 / strobe 10–255,
// Programs (No Function + Effect programs + Sound active), Program Speed.
const EP4 = profileFixture('ep4', [
  ch(0, 'intensity'), ch(1, 'red'), ch(2, 'green'), ch(3, 'blue'),
  ch(4, 'Strobe', [
    slot('off', 'Strobe OFF', 0, 9, 'NoFunction'),
    slot('strobe', 'Strobe (slow-fast 1-30Hz)', 10, 255, 'ShutterStrobe')
  ]),
  ch(5, 'Programs', [
    slot('none', 'No Function', 0, 9, 'NoFunction'),
    slot('switch', 'RGB colors switching', 10, 23, 'Effect'),
    slot('p1', 'Effect program 1', 84, 98, 'Effect'),
    slot('sound', 'Sound active mode', 249, 255, 'SoundSensitivity')
  ]),
  ch(6, 'Program Speed', undefined, 'slider')
])

function setShow(entries: { fixture: FixtureDef; values: Record<string, number> }[]) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const fixtures = entries.map((e) => e.fixture)
  // Inline cues (Jake, 27 Nov 2026): the cue lives in the Live button
  // that holds it, and the active cue is that holder's reference.
  const cue = { id: 'c1', name: 'Cue 1', fixtureValues: Object.fromEntries(entries.map((e) => [e.fixture.id, { intensity: 255, ...e.values }])), fadeMs: 0 }
  const show = {
    ...base,
    id: 'test-show',
    fixtures,
    livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', presetIds: [], cue, x: 0, y: 0 }] }]
  }
  act(() => {
    useShowStore.setState({ show, presets: [], cueLists: [], selectedFixtureIds: fixtures.map((f) => f.id), activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
  })
}

function cueValues(fixtureId: string) {
  const state = useShowStore.getState()
  return findInlineCue(state.show, state.cueLists, 'c1')?.cue.fixtureValues[fixtureId] ?? {}
}

// A Design write defines an override (LightKey's real Overrides) —
// these tests assert the value the fixture takes, which is the override.
function overrideValues(fixtureId: string) {
  return useShowStore.getState().manualOverrides[fixtureId] ?? {}
}

function shutterCard() {
  return container?.querySelector('[data-testid="shutter-strobe-card"]') as HTMLElement | null
}

function programCard() {
  return container?.querySelector('[data-testid="auto-program-card"]') as HTMLElement | null
}

function programSpeedCard() {
  return container?.querySelector('[data-testid="auto-program-speed-card"]') as HTMLElement | null
}

function radios() {
  return [...(shutterCard()?.querySelectorAll('[role="radio"]') ?? [])] as HTMLElement[]
}

function radio(name: string) {
  return radios().find((r) => r.textContent?.includes(name)) ?? null
}

function buttonIn(card: HTMLElement | null, name: string) {
  return [...(card?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(name)) as HTMLElement | undefined
}

function fader(label: string) {
  return container?.querySelector(`[aria-label="${label}"]`) as HTMLElement | null
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.getBoundingClientRect = () => RECT as unknown as DOMRect
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  root = undefined
  container?.remove()
  container = undefined
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

describe('Shutter/Strobe panel', () => {
  it('shows Open / Closed / Strobe / Pulse for a fixture with a ranged strobe channel', () => {
    setShow([{ fixture: R3, values: { red: 0, green: 0, blue: 255, Strobe: 1 } }])
    renderInRoot(<DesignTab />)
    expect(shutterCard()).not.toBeNull()
    expect(radio('Open')).not.toBeNull()
    expect(radio('Closed')).not.toBeNull()
    expect(buttonIn(shutterCard(), 'Strobe')).not.toBeNull()
    expect(buttonIn(shutterCard(), 'Pulse')).not.toBeNull()
    // The cue value 1 is in the Off range: Closed is the checked radio.
    expect(radio('Closed')?.getAttribute('aria-checked')).toBe('true')
    expect(radio('Open')?.getAttribute('aria-checked')).toBe('false')
    // The shutter channel is a card now, not a raw fader.
    expect(fader('Strobe for selected fixtures')).toBeNull()
  })

  it('Open writes the open range and Closed writes the closed range', () => {
    setShow([{ fixture: R3, values: { red: 0, green: 0, blue: 255, Strobe: 1 } }])
    renderInRoot(<DesignTab />)
    click(radio('Open')!)
    expect(overrideValues('r3').Strobe).toBe(6)
    click(radio('Closed')!)
    expect(overrideValues('r3').Strobe).toBe(2)
  })

  it('Strobe cycles the strobe modes in guide order and Pulse selects the pulse range — real strobe-range values', () => {
    setShow([{ fixture: R3, values: { red: 0, green: 0, blue: 255, Strobe: 6 } }])
    renderInRoot(<DesignTab />)
    click(buttonIn(shutterCard(), 'Strobe')!)
    expect(overrideValues('r3').Strobe).toBe(42)
    // Inside the Synchronising range (8–76): the fixture strobes.
    expect(overrideValues('r3').Strobe).toBeGreaterThanOrEqual(8)
    expect(overrideValues('r3').Strobe).toBeLessThanOrEqual(76)
    click(buttonIn(shutterCard(), 'Strobe')!)
    expect(overrideValues('r3').Strobe).toBe(181)
    click(buttonIn(shutterCard(), 'Pulse')!)
    expect(overrideValues('r3').Strobe).toBe(111)
  })

  it('shows a speed fader while strobing, and the speed moves the value inside the mode range', () => {
    setShow([{ fixture: R3, values: { red: 0, green: 0, blue: 255, Strobe: 6 } }])
    renderInRoot(<DesignTab />)
    expect(fader('Strobe speed for selected fixtures')).toBeNull()
    click(buttonIn(shutterCard(), 'Strobe')!)
    const speed = fader('Strobe speed for selected fixtures')
    expect(speed).not.toBeNull()
    expect(speed?.getAttribute('aria-valuenow')).toBe('128')
    keydown(speed!, 'ArrowUp', { shiftKey: true })
    expect(overrideValues('r3').Strobe).toBe(45)
    expect(overrideValues('r3').Strobe).toBeGreaterThanOrEqual(8)
    expect(overrideValues('r3').Strobe).toBeLessThanOrEqual(76)
  })

  it('supports the card keys O / C / S / P', () => {
    setShow([{ fixture: R3, values: { red: 0, green: 0, blue: 255, Strobe: 1 } }])
    renderInRoot(<DesignTab />)
    keydown(shutterCard()!, 'o')
    expect(overrideValues('r3').Strobe).toBe(6)
    keydown(shutterCard()!, 's')
    expect(overrideValues('r3').Strobe).toBe(42)
    keydown(shutterCard()!, 'c')
    expect(overrideValues('r3').Strobe).toBe(2)
    keydown(shutterCard()!, 'p')
    expect(overrideValues('r3').Strobe).toBe(111)
  })

  it('disables Closed when the profile has no closed range (EP4)', () => {
    setShow([{ fixture: EP4, values: { red: 0, green: 0, blue: 255, Strobe: 5 } }])
    renderInRoot(<DesignTab />)
    expect(radio('Closed')?.hasAttribute('disabled')).toBe(true)
    expect(radio('Open')?.getAttribute('aria-checked')).toBe('true')
    click(buttonIn(shutterCard(), 'Strobe')!)
    // Inside the EP4 strobe range (10–255 = 1–30 Hz): the bar strobes.
    expect(overrideValues('ep4').Strobe).toBe(133)
    expect(overrideValues('ep4').Strobe).toBeGreaterThanOrEqual(10)
  })

  it('shows Mixed when the selected fixtures disagree', () => {
    setShow([
      { fixture: R3, values: { red: 0, green: 0, blue: 255, Strobe: 1 } },
      { fixture: profileFixture('r3b', R3.profile!.modes[0].channels), values: { red: 0, green: 0, blue: 255, Strobe: 6 } }
    ])
    renderInRoot(<DesignTab />)
    expect(radio('Open')?.getAttribute('aria-checked')).toBe('false')
    expect(radio('Closed')?.getAttribute('aria-checked')).toBe('false')
    expect(shutterCard()?.textContent).toContain('Mixed')
  })

  it('raising the Dimmer from 0 opens a closed shutter (Guide p.98)', () => {
    setShow([{ fixture: R3, values: { red: 0, green: 0, blue: 255, intensity: 0, Strobe: 1 } }])
    renderInRoot(<DesignTab />)
    const dimmer = fader('Dimmer for selected fixtures')
    expect(dimmer).not.toBeNull()
    keydown(dimmer!, 'ArrowUp')
    expect(overrideValues('r3').intensity).toBe(1)
    expect(overrideValues('r3').Strobe).toBe(6)
  })

  it('clicking the card selects it — the blue border', () => {
    setShow([{ fixture: R3, values: { red: 0, green: 0, blue: 255, Strobe: 1 } }])
    renderInRoot(<DesignTab />)
    expect(shutterCard()?.className.includes('border-[#0A84FF]')).toBe(false)
    pointerdown(shutterCard()!)
    expect(shutterCard()?.className.includes('border-[#0A84FF]')).toBe(true)
  })
})

describe('Auto Program + Auto Program Speed panels', () => {
  it('shows "No Selection" for both until a program is chosen (Jake’s screenshot)', () => {
    setShow([{ fixture: EP4, values: { red: 0, green: 0, blue: 255, Strobe: 5, Programs: 5 } }])
    renderInRoot(<DesignTab />)
    expect(programCard()).not.toBeNull()
    expect(programSpeedCard()).not.toBeNull()
    expect(programCard()?.textContent).toContain('No Selection')
    expect(programSpeedCard()?.textContent).toContain('No Selection')
    expect(fader('Auto Program Speed for selected fixtures')).toBeNull()
    // The program/speed channels are cards now, not raw faders.
    expect(fader('Programs for selected fixtures')).toBeNull()
    expect(fader('Program Speed for selected fixtures')).toBeNull()
  })

  it('choosing a program writes its range midpoint, and the speed slider appears', () => {
    setShow([{ fixture: EP4, values: { red: 0, green: 0, blue: 255, Strobe: 5, Programs: 5 } }])
    renderInRoot(<DesignTab />)
    click(buttonIn(programCard(), 'No Selection')!)
    const listbox = container?.querySelector('[role="listbox"]')
    expect(listbox).not.toBeNull()
    expect(listbox?.textContent).toContain('Effect program 1')
    expect(listbox?.textContent).toContain('RGB colors switching')
    const option = [...(listbox?.querySelectorAll('[role="option"]') ?? [])].find((o) => o.textContent === 'Effect program 1') as HTMLElement
    click(option)
    expect(overrideValues('ep4').Programs).toBe(91)
    expect(programCard()?.textContent).toContain('Effect program 1')
    const speed = fader('Auto Program Speed for selected fixtures')
    expect(speed).not.toBeNull()
    expect(speed?.getAttribute('aria-valuenow')).toBe('0')
  })

  it('the speed slider writes the program speed channel', () => {
    setShow([{ fixture: EP4, values: { red: 0, green: 0, blue: 255, Strobe: 5, Programs: 91 } }])
    renderInRoot(<DesignTab />)
    const speed = fader('Auto Program Speed for selected fixtures')
    expect(speed).not.toBeNull()
    keydown(speed!, 'Home')
    expect(overrideValues('ep4')['Program Speed']).toBe(255)
    keydown(speed!, 'End')
    expect(overrideValues('ep4')['Program Speed']).toBe(0)
  })

  it('choosing "No Selection" again writes the no-function range', () => {
    setShow([{ fixture: EP4, values: { red: 0, green: 0, blue: 255, Strobe: 5, Programs: 91 } }])
    renderInRoot(<DesignTab />)
    click(buttonIn(programCard(), 'Effect program 1')!)
    const option = [...(container?.querySelectorAll('[role="option"]') ?? [])].find((o) => o.textContent === 'No Selection') as HTMLElement
    click(option)
    expect(overrideValues('ep4').Programs).toBe(5)
    expect(programSpeedCard()?.textContent).toContain('No Selection')
  })

  it('supports the list keyboard: Enter opens, ArrowDown moves, Enter selects', () => {
    setShow([{ fixture: EP4, values: { red: 0, green: 0, blue: 255, Strobe: 5, Programs: 5 } }])
    renderInRoot(<DesignTab />)
    const button = buttonIn(programCard(), 'No Selection')!
    keydown(button, 'Enter')
    expect(container?.querySelector('[role="listbox"]')).not.toBeNull()
    keydown(button, 'ArrowDown')
    keydown(button, 'Enter')
    expect(overrideValues('ep4').Programs).toBe(17)
  })

  it('shows Mixed when the selected fixtures run different programs', () => {
    setShow([
      { fixture: EP4, values: { red: 0, green: 0, blue: 255, Strobe: 5, Programs: 16 } },
      { fixture: profileFixture('ep4b', EP4.profile!.modes[0].channels), values: { red: 0, green: 0, blue: 255, Strobe: 5, Programs: 91 } }
    ])
    renderInRoot(<DesignTab />)
    expect(programCard()?.textContent).toContain('Mixed')
    expect(programSpeedCard()?.textContent).toContain('Mixed')
  })
})

describe('no panels without the channels', () => {
  it('shows no Shutter/Strobe or Auto Program cards for an RGB-only par', () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const fixture: FixtureDef = { id: 'fx1', name: 'Test Par', type: 'par', channelStart: 1, channels: 4 }
    const cue = { id: 'c1', name: 'Cue 1', fixtureValues: { fx1: { intensity: 255, red: 0, green: 0, blue: 0 } }, fadeMs: 0 }
    const show = { ...base, id: 'test-show', fixtures: [fixture], livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', presetIds: [], cue, x: 0, y: 0 }] }] }
    act(() => { useShowStore.setState({ show, presets: [], cueLists: [], selectedFixtureIds: ['fx1'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false }) })
    renderInRoot(<DesignTab />)
    expect(shutterCard()).toBeNull()
    expect(programCard()).toBeNull()
    expect(programSpeedCard()).toBeNull()
  })

  it('a slot-less strobe byte stays a raw fader — no Shutter/Strobe card it cannot drive', () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const fixture: FixtureDef = { id: 'fx1', name: 'Test Head', type: 'moving-head', channelStart: 1, channels: 8 }
    const cue = { id: 'c1', name: 'Cue 1', fixtureValues: { fx1: { intensity: 255, red: 0, green: 0, blue: 0, strobe: 0 } }, fadeMs: 0 }
    const show = { ...base, id: 'test-show', fixtures: [fixture], livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', presetIds: [], cue, x: 0, y: 0 }] }] }
    act(() => { useShowStore.setState({ show, presets: [], cueLists: [], selectedFixtureIds: ['fx1'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false }) })
    renderInRoot(<DesignTab />)
    expect(shutterCard()).toBeNull()
    expect(fader('Strobe for selected fixtures')).not.toBeNull()
  })
})

describe('Shutter/Auto Program wiring (source)', () => {
  it('reads the panels from the new libs and keeps their channels out of the fader row', () => {
    const root = resolve(__dirname, '..')
    const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')
    expect(design).toContain("from '../lib/shutterStrobe'")
    expect(design).toContain("from '../lib/autoProgram'")
    expect(design).toContain('!cardAttributes.has(attribute)')
    expect(design).toContain('data-testid="shutter-strobe-card"')
    expect(design).toContain('data-testid="auto-program-card"')
    expect(design).toContain('data-testid="auto-program-speed-card"')
  })
})
