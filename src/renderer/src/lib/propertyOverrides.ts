export type PropertyValues = Record<string, Record<string, number>>

/** Omitted fixture ids release every fixture; omitted property releases every property. */
export function releaseOverrides(values: PropertyValues, fixtureIds?: string[], property?: string): PropertyValues {
  const result: PropertyValues = {}
  for (const [id, properties] of Object.entries(values)) {
    if (fixtureIds && !fixtureIds.includes(id)) { result[id] = { ...properties }; continue }
    const remaining = property ? Object.fromEntries(Object.entries(properties).filter(([key]) => key !== property)) : {}
    if (Object.keys(remaining).length) result[id] = remaining
  }
  return result
}
