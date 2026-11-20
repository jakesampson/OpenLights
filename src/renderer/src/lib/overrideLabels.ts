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

export interface OverrideLabelBox {
  /** The fixture id the label belongs to. */
  id: string
  /** Anchor position: the label's top-left corner before de-collision. */
  x: number
  y: number
  width: number
  height: number
}

/**
 * De-collide override labels (Jake, 20 Nov 2026 — two labels drawn on
 * top of each other in the Preview). Labels are placed top-to-bottom,
 * left-to-right; a label that would overlap one already placed is
 * shifted down only as far as needed to clear it (2px gap), so every
 * label stays readable and keeps LightKey's look — the pointer arrow
 * moves with the label, still pointing at its fixture. Covers any
 * number of nearby overridden fixtures: a shifted label can push the
 * next one down in turn. Labels that do not collide are not moved.
 */
export function layoutOverrideLabels(boxes: OverrideLabelBox[]): Map<string, { x: number; y: number }> {
  const GAP = 2
  const placed: OverrideLabelBox[] = []
  const positions = new Map<string, { x: number; y: number }>()
  for (const box of [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let y = box.y
    let moved = true
    while (moved) {
      moved = false
      for (const other of placed) {
        const overlapsX = box.x < other.x + other.width + GAP && box.x + box.width + GAP > other.x
        const overlapsY = y < other.y + other.height + GAP && y + box.height + GAP > other.y
        if (overlapsX && overlapsY) {
          y = other.y + other.height + GAP
          moved = true
        }
      }
    }
    placed.push({ ...box, y })
    positions.set(box.id, { x: box.x, y })
  }
  return positions
}
