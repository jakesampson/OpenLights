import { fixtureChannelMap } from '@shared/fixtureProfiles'
import type { EffectDef, FixtureDef, LivePage, PresetDef } from '@shared/types'
import { completeBaseColour, fanPresetFixtureValues, resolveCue } from '@shared/cueResolution'
import { isDimmerAttribute } from './automationRuntime'
import { orderedLiveControls } from './cuePriority'
import { liveOutputLevels } from './liveFrames'

/**
 * Dimmer-effect ownership (Jake, 28 Nov 2026 — the layering blank):
 * a Dimmer effect running from a Live button only controls the dimmer
 * channel, so triggering a colour preset while it runs must change the
 * colour and keep the effect dimming — in LightKey the two compose.
 * They did not compose here, because a colour preset carries no
 * intensity and a virtual-dimmer fixture (Q12BT and the like: no dimmer
 * channel) resolves an unset virtual dimmer to 0 — so the preset/live
 * patch wrote explicit zeros on the LED channels, and the presets/live
 * layers (spread AFTER effects in composeOutput) zeroed the effect's
 * output. The effect never stopped: activeOwnedEffects forces a
 * Live-button effect back on in the runtime copy, so switching the
 * colour off again brought the beams back.
 *
 * The fix is ownership, not a level: for a fixture whose dimmer a
 * running Dimmer effect owns, the preset/live/override patches must not
 * write the LED channels the effect scales — the effect layer is the
 * only writer of those channels, and it already takes its colour from
 * the base look (cue + active presets + overrides + lit Live pads).
 * The level is never baked into a patch (the effect animates; a sampled
 * level would freeze it), and the layer order is unchanged — presets
 * still win over effects on every channel the effect does not own.
 * Physical-dimmer fixtures are untouched: their preset patch writes no
 * intensity channel, so the effect's intensity already survives.
 */

/** Fixture ids whose dimmer a running Dimmer effect owns. Only
 *  virtual-dimmer fixtures qualify — an effect on a physical-dimmer
 *  fixture writes the intensity channel itself, which no preset patch
 *  overwrites. Disabled effects and non-dimmer effects own nothing. */
export function dimmerEffectFixtureIds(fixtures: FixtureDef[], effects: EffectDef[]): Set<string> {
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const owned = new Set<string>()
  for (const effect of effects) {
    if (!effect.enabled || effect.attribute !== 'intensity') continue
    for (const id of effect.fixtureIds) {
      const fixture = byId.get(id)
      if (!fixture) continue
      if (fixtureChannelMap(fixture)['intensity'] !== undefined) continue
      owned.add(id)
    }
  }
  return owned
}

/** The DMX channels a running Dimmer effect drives on virtual-dimmer
 *  fixtures — exactly the LED channels writeVirtualDimmer scales, so
 *  stripping these from a higher layer leaves the effect as the sole
 *  writer and changes nothing else (pan/tilt/strobe channels from the
 *  same preset still land). */
export function dimmerEffectOwnedChannels(fixtures: FixtureDef[], effects: EffectDef[]): Set<number> {
  const owned = dimmerEffectFixtureIds(fixtures, effects)
  const channels = new Set<number>()
  for (const fixture of fixtures) {
    if (!owned.has(fixture.id)) continue
    for (const [attr, offset] of Object.entries(fixtureChannelMap(fixture))) {
      if (!isDimmerAttribute(attr)) continue
      channels.add(fixture.channelStart + offset)
    }
  }
  return channels
}

/** Remove the effect-owned LED channels from a channel patch (a copy;
 *  the input is untouched, and an empty owned set returns it as-is). */
export function stripOwnedDimmerChannels(
  patch: Record<number, number>,
  ownedChannels: Set<number>
): Record<number, number> {
  if (ownedChannels.size === 0) return patch
  const next = { ...patch }
  for (const channel of ownedChannels) delete next[channel]
  return next
}

/** The lit Live pads' values, for the effect's base look (Jake,
 *  28 Nov 2026): a Live colour button is part of the look the rig is
 *  showing, so a running Dimmer effect must take its colour from it
 *  too — otherwise the effect chases in the default blue while a Live
 *  colour button is lit (the base look previously carried only the cue,
 *  active presets and overrides). Resolved the same way the live patch
 *  resolves them — cue, then presets, then ad-hoc values, in activation
 *  order, later winning — with the LED attributes scaled by the pad's
 *  level, so a fader at half still composes (fader level x effect
 *  level). Non-colour attributes are taken as the look states them. */
export function liveBaseValues(
  pages: LivePage[] | undefined,
  activeLiveValues: Record<string, number>,
  activationOrder: Record<string, number>,
  presets: PresetDef[],
  fixtures: FixtureDef[]
): Record<string, Record<string, number>> {
  const outputLevels = liveOutputLevels(pages, activeLiveValues)
  const controls = orderedLiveControls(pages, outputLevels, activationOrder)
  const values: Record<string, Record<string, number>> = {}
  const take = (patch: Record<string, Record<string, number>>, level: number) => {
    for (const [fixtureId, attrs] of Object.entries(patch)) {
      const next = { ...(values[fixtureId] ?? {}) }
      for (const [attr, value] of Object.entries(attrs)) {
        if (typeof value !== 'number' || Number.isNaN(value)) continue
        next[attr] = isDimmerAttribute(attr) && attr !== 'intensity'
          ? Math.round(value * level / 255)
          : value
      }
      values[fixtureId] = next
    }
  }
  for (const control of controls) {
    const level = outputLevels[control.id] ?? 0
    if (!level) continue
    if (control.cue && !control.cue.blackout) take(resolveCue(control.cue, presets, fixtures).fixtureValues, level)
    for (const id of control.presetIds ?? []) {
      const preset = presets.find((item) => item.id === id)
      if (preset) take(completeBaseColour(fanPresetFixtureValues(preset.fixtureValues, fixtures), fixtures), level)
    }
    if (control.adHocValues) take(control.adHocValues, level)
  }
  return values
}
