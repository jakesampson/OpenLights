// Per-property fanning (LightKey Guide §8, p.118–123; "How to Use
// Fanning" video): fanning is added from a fixture property's own
// control in the Design view, a fanned property's area shows an icon
// instead of its normal controls, and the blue dot by its name deletes
// the fanning. Source assertions (no DOM renderer), in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')
const propertyFan = readFileSync(resolve(root, 'src/renderer/src/components/PropertyFan.tsx'), 'utf8')
const preview = readFileSync(resolve(root, 'src/renderer/src/components/StagePreview.tsx'), 'utf8')
const hud = readFileSync(resolve(root, 'src/renderer/src/components/FanningHud.tsx'), 'utf8')
const hudLib = readFileSync(resolve(root, 'src/renderer/src/lib/fanningHud.ts'), 'utf8')

describe('PropertyFan — the per-property entry point', () => {
  it('dispatches the HUD event for a picked property', () => {
    expect(propertyFan).toContain("window.dispatchEvent(new CustomEvent('openlights-open-fan-hud', { detail }))")
    expect(propertyFan).toContain('export function dispatchFanHud')
  })

  it('offers "Add (property) Fanning…" from a menu on the property', () => {
    // Guide p.119: "Click the fixture property's name in the Design
    // view … then choose Add (property name) Fanning… from the menu."
    expect(propertyFan).toContain('Add ${label} fanning')
    expect(propertyFan).toContain('role="menu"')
    expect(propertyFan).toContain('role="menuitem"')
  })

  it('replaces a fanned property’s controls with an icon, and marks it with a blue dot', () => {
    // Guide p.122: "When a fixture property is being fanned, its area
    // in the Design view shows an icon instead of the normal controls."
    expect(propertyFan).toContain('export function FannedIcon')
    expect(propertyFan).toContain('is fanned — click to edit the fanning')
    // Guide p.123: the blue dot to the left of the property's name
    // deletes the fanning, keeping the fanned values.
    expect(propertyFan).toContain('export function FanDeleteDot')
    expect(propertyFan).toContain('text-blue-400')
    expect(propertyFan).toContain('Delete ${label} fanning (keep the fanned values)')
  })
})

describe('DesignTab — every control carries its own fan affordance', () => {
  it('has no dedicated Fan… button', () => {
    expect(design).not.toContain('>Fan…')
    expect(design).not.toContain('FanningHud')
  })

  it('puts a fan menu on Dimmer, Colour, Position and every slider fader', () => {
    expect(design).toContain('<FanMenuButton label="Dimmer"')
    expect(design).toContain("items={[{ label: 'Add Dimmer Fanning…', onSelect: () => dispatchFanHud({ attribute: 'intensity' }) }]}")
    expect(design).toContain('<FanMenuButton label="Colour"')
    expect(design).toContain("label: 'Add Colour Fanning…', onSelect: () => dispatchFanHud({ attribute: 'color' })")
    // Piece 11 (Guide p.114): the same Colour menu offers the
    // default-value actions — Set / Load / Reset Default.
    expect(design).toContain("label: 'Set as Default', onSelect: () => setColorDefault()")
    expect(design).toContain("label: 'Load Default', onSelect: () => loadColorDefault()")
    expect(design).toContain("label: 'Reset Default', onSelect: () => resetColorDefault()")
    expect(design).toContain('<FanMenuButton')
    expect(design).toContain("label: 'Add Pan Fanning…'")
    expect(design).toContain("label: 'Add Tilt Fanning…'")
    expect(design).toContain("label: 'Add Pan + Tilt Fanning…'")
    expect(design).toContain("dispatchFanHud({ attribute: 'pan', alsoAttribute: 'tilt' })")
    expect(design).toContain('<FanMenuButton label={attributeLabel(attribute)}')
  })

  it('only offers fanning for slider properties, not wheel slots or options', () => {
    // Guide §8, p.118: "any custom property represented by a slider".
    expect(design).toContain("const isSlider = !channel?.control || channel.control === 'slider'")
    expect(design).toContain('showFanButtons && !fan && isSlider')
  })

  it('hides the fan buttons while editing a preset, but shows them with beams selected', () => {
    // Fans are cue-level (fanning is hidden while editing a preset);
    // with beams selected the fan opens across those beams (Piece 7).
    expect(design).toContain('const showFanButtons = !editingPreset')
  })

  it('replaces a fanned control with the icon and marks it with the blue dot', () => {
    expect(design).toContain('<FannedIcon label="Dimmer"')
    expect(design).toContain('<FannedIcon label="Colour"')
    expect(design).toContain('<FannedIcon label="Position"')
    expect(design).toContain('<FannedIcon label={attributeLabel(attribute)}')
    expect(design).toContain('<FanDeleteDot label="Dimmer"')
    expect(design).toContain('<FanDeleteDot label="Colour"')
    expect(design).toContain('<FanDeleteDot label="Position"')
    expect(design).toContain('<FanDeleteDot label={attributeLabel(attribute)}')
    // Deleting from the dot keeps the fanned values.
    expect(design).toContain('deleteFan(fan.id, true)')
  })

  it('reads the fanned state from the active cue’s fans', () => {
    expect(design).toContain("const fans = activeCue?.fans ?? []")
    expect(design).toContain("const fanFor = (attribute: string) => fans.find((f) => f.attribute === attribute && f.fixtureIds.some((id) => selectedFixtureIds.includes(id)))")
  })
})

describe('StagePreview — the HUD opens for the picked property, editing an existing fan', () => {
  it('reopens a saved fan for editing instead of starting a new draft', () => {
    // Guide p.122: "Click the icon in the Design view" to edit.
    expect(preview).toContain("const existing = activeCue?.fans?.find((f) => f.attribute === chosen && f.fixtureIds.some((id) => selectedFixtureIds.includes(id)))")
    expect(preview).toContain('if (existing) { setFanDraft(structuredClone(existing)); return }')
  })

  it('starts a colour fan from the fixtures’ current colours', () => {
    expect(preview).toContain('defaultColorFan([...selectedFixtureIds], firstColor, lastColor)')
    expect(preview).toContain('fixtureValuesToHex')
  })

  it('creates the second fan for Pan + Tilt when the first is committed', () => {
    // LightKey offers pan, tilt or both for Position (video); OpenLights
    // fans one attribute per fan, so "both" is two fans.
    expect(preview).toContain('pendingAlsoFan')
    expect(preview).toContain('if (isNew && pending)')
  })

  it('still takes the property from the dispatched event', () => {
    expect(preview).toContain("const detail = (event as CustomEvent<{ attribute?: string; alsoAttribute?: string }>).detail")
    expect(preview).toContain('openFanHud(detail?.attribute, detail?.alsoAttribute)')
  })
})

describe('FanningHud — colour fans', () => {
  it('lists Color as a fannable property for colour fixtures', () => {
    expect(hud).toContain('fannableProperties(draftFixtures)')
    expect(hudLib).toContain("attribute: 'color', propertyType: 'color'")
    expect(hud).toContain("onCommit(next.attribute === 'color' ? { ...draft, attribute: 'color', startColor: '#ff0000', endColor: '#0000ff', anchors: undefined }")
  })

  it('edits colours per fixture instead of numbers for a colour fan', () => {
    expect(hud).toContain('<ColorField')
    expect(hud).toContain('setFanRowColor(draft, row.index, value, rows.length)')
    expect(hud).toContain("{draft.beams ? 'Beams' : 'Fixtures'} — set a {isColor ? 'colour' : 'value'} per {draft.beams ? 'beam' : 'fixture'}")
  })
})
