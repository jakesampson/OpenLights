export type PropertyValues = Record<string, Record<string, number>>

/** Omitted fixture ids release every fixture; omitted property releases every property.
 * A property may be a single attribute or a group of them (a label
 * row's Color = red/green/blue — the per-property ✕ in LightKey's
 * override labels clears that property's attributes together). */
export function releaseOverrides(values: PropertyValues, fixtureIds?: string[], property?: string | string[]): PropertyValues {
  const result: PropertyValues = {}
  const properties = property === undefined ? undefined : (Array.isArray(property) ? property : [property])
  for (const [id, valuesForFixture] of Object.entries(values)) {
    if (fixtureIds && !fixtureIds.includes(id)) { result[id] = { ...valuesForFixture }; continue }
    const remaining = properties ? Object.fromEntries(Object.entries(valuesForFixture).filter(([key]) => !properties.includes(key))) : {}
    if (Object.keys(remaining).length) result[id] = remaining
  }
  return result
}
