import type { FixtureProfile } from '@shared/types'
export function filterProfiles(profiles: FixtureProfile[], filter: { query?: string; manufacturer?: string; channels?: number; favoritesOnly?: boolean }, favorites: string[] = []): FixtureProfile[] {
  const query = filter.query?.trim().toLowerCase() ?? ''
  return profiles.filter((p) => (!query || `${p.name} ${p.manufacturer}`.toLowerCase().includes(query)) && (!filter.manufacturer || p.manufacturer === filter.manufacturer) && (!filter.channels || p.modes.some((m) => Math.max(...m.channels.map((c) => c.number)) + 1 === filter.channels)) && (!filter.favoritesOnly || favorites.includes(p.id)))
}
