import type { FixtureDef } from '@shared/types'
export function selectFixtureIds(fixtures: FixtureDef[], filter: { name?: string; type?: string; location?: 'left' | 'right' | 'front' | 'back' } = {}): string[] {
  return fixtures.filter((f) => (!filter.name || f.name.toLowerCase().includes(filter.name.trim().toLowerCase())) && (!filter.type || f.type === filter.type) && (!filter.location || Boolean(f.previewPosition && !f.inStorage && ({ left: f.previewPosition.x < 400, right: f.previewPosition.x >= 400, front: f.previewPosition.y >= 170, back: f.previewPosition.y < 170 })[filter.location]))).map((f) => f.id)
}
