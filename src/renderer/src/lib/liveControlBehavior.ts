// Live-button type / behaviour helpers (Jake, 27 Nov 2026 — LightKey
// guide ch.11, p.204): Type (Push Button / Fader Horizontal / Fader
// Vertical) and Behaviour (Toggle / Flash) are separate axes. A Push
// Button is NOT momentary — with Toggle behaviour (the default) it
// latches, click on / click again off; Flash is the momentary one.
// The old model collapsed them into one `type` field ('toggle' /
// 'flash' / 'fader'); every branch that used to read the old type goes
// through these helpers so the split stays in one place.
import type { LiveControl } from '@shared/types'

export type LiveControlBehavior = 'toggle' | 'flash'

/** The button's behaviour: Toggle unless it says Flash. Faders have no
 *  behaviour, so an unset behaviour on any control also reads Toggle. */
export function controlBehavior(control: LiveControl): LiveControlBehavior {
  return control.behavior ?? 'toggle'
}

/** True for a Fader of either orientation. */
export function isFaderControl(control: LiveControl): boolean {
  return control.type === 'faderHorizontal' || control.type === 'faderVertical'
}

/** True for a Push Button with Flash behaviour — the only momentary
 *  control: active only while held. */
export function isFlashControl(control: LiveControl): boolean {
  return control.type === 'push' && controlBehavior(control) === 'flash'
}

/** True for a Push Button with Toggle behaviour — the only latching
 *  control: click once on, click again off. */
export function isLatchingControl(control: LiveControl): boolean {
  return control.type === 'push' && controlBehavior(control) === 'toggle'
}
