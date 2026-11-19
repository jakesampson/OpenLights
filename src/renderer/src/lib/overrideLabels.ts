// Grouping channel attributes into the property names LightKey shows in
// its override labels (Guide ch.11, p.116: "The labels show the names
// of the overridden properties"; Jake's LightKey screenshots 20 Nov 2026
// show "Dimmer", "Shutter", "Gobo Wheel", "Strobe", one per line).
// Per-beam attributes (red2, green3, …) fold into the same property as
// the unnumbered attribute — the label names the property, not the beam.

export interface OverridePropertyGroup {
  /** LightKey's property name, e.g. "Dimmer", "Color", "Gobo Wheel". */
  name: string
  /** The channel attributes in this group, in first-seen order. */
  attributes: string[]
}

interface PropertyGroupDef {
  name: string
  /** Matches an attribute's base (trailing per-beam digits stripped). */
  matches: (base: string) => boolean
}

// Display order: LightKey's property order as seen in the screenshots
// (Dimmer first), unknowns last in first-seen order.
const GROUP_DEFS: PropertyGroupDef[] = [
  { name: 'Dimmer', matches: (base) => base === 'intensity' || base === 'dimmer' },
  { name: 'Color', matches: (base) => ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'hue', 'saturation', 'brightness'].includes(base) },
  { name: 'White', matches: (base) => base === 'white' || base === 'coolwhite' },
  { name: 'Amber', matches: (base) => base === 'amber' },
  { name: 'Ultraviolet', matches: (base) => base === 'uv' || base === 'ultraviolet' },
  { name: 'Lime', matches: (base) => base === 'lime' },
  { name: 'Pan', matches: (base) => base === 'pan' },
  { name: 'Tilt', matches: (base) => base === 'tilt' },
  { name: 'Shutter', matches: (base) => base === 'shutter' },
  { name: 'Strobe', matches: (base) => base === 'strobe' },
  { name: 'Gobo Wheel', matches: (base) => base === 'gobo' },
  { name: 'Focus', matches: (base) => base === 'focus' },
  { name: 'Zoom', matches: (base) => base === 'zoom' },
  { name: 'Iris', matches: (base) => base === 'iris' },
]

function titleCase(attribute: string): string {
  return attribute.charAt(0).toUpperCase() + attribute.slice(1)
}

export function overridePropertyGroups(overrides: Record<string, number>): OverridePropertyGroup[] {
  const groups: OverridePropertyGroup[] = []
  const byName = new Map<string, OverridePropertyGroup>()
  const unknownOrder: OverridePropertyGroup[] = []
  for (const attribute of Object.keys(overrides)) {
    // Per-beam attributes carry a trailing beam digit (red2, green3) —
    // strip it so the attribute groups with its property.
    const base = attribute.replace(/\d+$/, '').toLowerCase()
    const def = GROUP_DEFS.find((d) => d.matches(base))
    const name = def ? def.name : titleCase(base)
    let group = byName.get(name)
    if (!group) {
      group = { name, attributes: [] }
      byName.set(name, group)
      if (!def) unknownOrder.push(group)
    }
    group.attributes.push(attribute)
  }
  const known = GROUP_DEFS.map((d) => byName.get(d.name)).filter((g): g is OverridePropertyGroup => g !== undefined)
  return [...known, ...unknownOrder]
}
