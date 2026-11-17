export interface SelectableObject { id: string; x: number; y: number; width: number; height: number; rotation?: number }
export interface Point { x: number; y: number }
export function hitTest(item: SelectableObject, point: Point): boolean {
  const angle = -(item.rotation ?? 0) * Math.PI / 180, dx = point.x - item.x, dy = point.y - item.y
  return Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= item.width / 2 && Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= item.height / 2
}
export function marqueeSelection(items: SelectableObject[], from: Point, to: Point): string[] {
  const left = Math.min(from.x, to.x), right = Math.max(from.x, to.x), top = Math.min(from.y, to.y), bottom = Math.max(from.y, to.y)
  const box = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
  return items.filter((item) => {
    const angle = (item.rotation ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
    const polygon = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: item.x + sx * item.width / 2 * cos - sy * item.height / 2 * sin, y: item.y + sx * item.width / 2 * sin + sy * item.height / 2 * cos }))
    return [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: cos, y: sin }, { x: -sin, y: cos }].every((axis) => {
      const a = polygon.map((p) => p.x * axis.x + p.y * axis.y), b = box.map((p) => p.x * axis.x + p.y * axis.y)
      return Math.max(...a) >= Math.min(...b) && Math.max(...b) >= Math.min(...a)
    })
  }).map((item) => item.id)
}
