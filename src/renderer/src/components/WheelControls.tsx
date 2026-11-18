import type { FixtureChannel } from '@shared/types'
import { wheelSlotValue } from '../lib/wheelProperties'
export function WheelControls({ channels, update, valueFor }: { channels: FixtureChannel[]; update: (values: Record<string, number>) => void; valueFor: (attribute: string) => number }) {
  return <div className="flex flex-wrap gap-2">{channels.filter((c) => c.control === 'color-wheel' || c.control === 'gobo-wheel').map((channel) => {
    const value = valueFor(channel.attribute), slot = channel.slots?.find((s) => value >= s.from && value <= s.to)
    return <label key={channel.attribute} className="text-xs capitalize">{channel.attribute}<select aria-label={`${channel.attribute} wheel slot`} value={slot?.id ?? ''} onChange={(e) => update({ [channel.attribute]: wheelSlotValue(channel, e.target.value) })} className="ml-1 rounded bg-panel2 p-1"><option value="" disabled>Choose slot</option>{channel.slots?.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.kind}</option>)}</select>{slot && slot.kind !== 'slot' && <input type="range" aria-label={`${channel.attribute} ${slot.kind} speed`} min={slot.from} max={slot.to} value={value} onChange={(e) => update({ [channel.attribute]: Number(e.target.value) })} />}</label>
  })}</div>
}
