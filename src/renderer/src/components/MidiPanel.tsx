import { useCallback, useEffect, useRef, useState } from 'react'
import { useShowStore, findInlineCue } from '../stores/showStore'
import { initMidi, matchMapping, describeMapping, learnMapping, mappingAction, midiAvailable } from '../lib/midi'
import type { MidiMessage } from '../lib/midi'
import type { MidiMapping, MidiTargetType } from '@shared/types'
import { MidiBeatClock } from '../lib/beatGrid'
import { calculateTapTempo } from '../lib/tapTempo'

interface LearnTarget {
  targetType: MidiTargetType
  targetId: string | null
  label: string
}

type MidiState = 'unsupported' | 'requesting' | 'granted' | 'denied' | 'timeout'

export function MidiPanel({ initialLearnTarget = null }: { initialLearnTarget?: LearnTarget | null } = {}) {
  const {
    cueLists,
    show,
    presets,
    midiMappings,
    activateCue,
    addMidiMapping,
    removeMidiMapping,
    setMaster,
    toggleBlackout
    , setBpm, toggleBlind, toggleFreeze, togglePreset, toggleSequence, setLiveValue, cuePrev
  } = useShowStore()
  const [midiState, setMidiState] = useState<MidiState>('requesting')
  const [inputs, setInputs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [learnTarget, setLearnTarget] = useState<LearnTarget | null>(null)
  const [attempt, setAttempt] = useState(0)
  const learnRef = useRef<LearnTarget | null>(null)
  const clock = useRef(new MidiBeatClock())
  const taps = useRef<number[]>([])

  // A learn armed from a button's External Control menu (Jake,
  // 27 Nov 2026 — LightKey's "Add Trigger…"): open with the learn
  // already listening for that button.
  useEffect(() => { if (initialLearnTarget) setLearnTarget(initialLearnTarget) }, [initialLearnTarget])

  // Keep a ref in sync so the MIDI callback always sees the latest arm state
  useEffect(() => {
    learnRef.current = learnTarget
  }, [learnTarget])

  const handleMessage = useCallback(
    (msg: MidiMessage) => {
      const target = learnRef.current
      if (target) {
        const mapping = learnMapping({ targetType: target.targetType, targetId: target.targetId, name: target.label }, msg, crypto.randomUUID())
        // One trigger per target (LightKey's Add / Replace / Remove
        // model): learning a new trigger for a target replaces the old
        // one instead of stacking a second mapping on it.
        for (const existing of useShowStore.getState().midiMappings ?? []) {
          if (existing.targetType === target.targetType && existing.targetId === target.targetId) removeMidiMapping(existing.id)
        }
        addMidiMapping(mapping)
        setLearnTarget(null)
        return
      }

      const match = matchMapping(useShowStore.getState().midiMappings, msg)
      if (!match) return
      const action = mappingAction(match, msg)
      if (!action) return

      if (action.type === 'master') {
        setMaster(Math.round((action.value ?? msg.value / 127) * 255))
        return
      }
      if (action.type === 'blackout') {
        toggleBlackout()
        return
      }
      if (action.type === 'blind') { toggleBlind(); return }
      if (action.type === 'freeze') { toggleFreeze(); return }
      if (action.type === 'cue-prev') { cuePrev(); return }
      if (action.type === 'tap-tempo') { const result = calculateTapTempo(taps.current, performance.now()); taps.current = result.taps; if (result.bpm !== null) setBpm(result.bpm); return }
      if (action.type === 'preset' && action.targetId) { togglePreset(action.targetId); return }
      if (action.type === 'sequence' && action.targetId) { toggleSequence(action.targetId); return }
      if (action.type === 'live-cue' && action.targetId) { const value = useShowStore.getState().activeLiveValues[action.targetId] ? 0 : 1; setLiveValue(action.targetId, value); return }
      if (match.targetType === 'cue-next') {
        const state = useShowStore.getState()
        if (!match.targetId) return
        if (state.activeCueListId === match.targetId && state.cuePlaying) state.cueNext()
        else state.goToCue(match.targetId, 0)
        return
      }
      if (match.targetType === 'cue' && match.targetId) {
        // activateCue resolves the id across holders; a mapping whose
        // cue copy is gone is a no-op (the panel shows it unmappable).
        activateCue(match.targetId)
      }
    },
    [addMidiMapping, removeMidiMapping, cuePrev, activateCue, setBpm, setLiveValue, setMaster, toggleBlackout, toggleBlind, toggleFreeze, togglePreset, toggleSequence]
  )

  useEffect(() => {
    if (!midiAvailable()) {
      setMidiState('unsupported')
      return
    }

    let cancelled = false
    setMidiState('requesting')
    setError(null)

    // Some environments never settle requestMIDIAccess; guard with a timeout.
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        setMidiState((s) => (s === 'requesting' ? 'timeout' : s))
        setError('MIDI access timed out. No MIDI device may be connected, or permission was blocked.')
      }
    }, 6000)

    initMidi(handleMessage, (names) => {
      if (!cancelled) {
        setInputs(names)
        if (names.length === 0) setMidiState('granted')
      }
    }, (timestamp) => {
      const bpm = clock.current.push(timestamp)
      if (bpm !== null) setBpm(bpm)
    })
      .then((names) => {
        if (cancelled) return
        window.clearTimeout(timer)
        setInputs(names)
        setMidiState('granted')
      })
      .catch((e) => {
        if (cancelled) return
        window.clearTimeout(timer)
        setError(e?.message ?? String(e))
        setMidiState('denied')
      })

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [handleMessage, attempt, setBpm])

  const armedFor = (targetId: string | null, targetType: MidiTargetType) =>
    learnTarget?.targetType === targetType && learnTarget.targetId === targetId

  const arm = (target: LearnTarget) => setLearnTarget(target)
  const disarm = () => setLearnTarget(null)
  const retry = () => setAttempt((n) => n + 1)

  const badge =
    midiState === 'granted'
      ? { label: inputs.length > 0 ? 'MIDI Ready' : 'No Devices', cls: 'bg-emerald-500/20 text-emerald-400' }
      : midiState === 'requesting'
        ? { label: 'Connecting…', cls: 'bg-amber-500/20 text-amber-400' }
        : midiState === 'unsupported'
          ? { label: 'Not Supported', cls: 'bg-zinc-700/40 text-zinc-400' }
          : { label: 'Unavailable', cls: 'bg-red-500/20 text-red-400' }

  // A 'cue' mapping's targetId is the id of ONE inline cue copy —
  // the cue object held by one specific button or cuelist step (Jake,
  // 27 Nov 2026 — there is no shared cue any more; the migration
  // remapped an old shared-cue target onto its first copy, button
  // preferred). It resolves through that holder only: findInlineCue
  // scans buttons then list steps for the id. A cue copied into
  // several holders is a separate cue in each, so learning the "same"
  // cue in another holder binds a different copy (a different
  // targetId); re-pointing a mapping at another copy means removing
  // it here and learning the other holder's row.
  const cueName = (id: string | null) => (id ? findInlineCue(show, cueLists, id)?.cue.name ?? null : null)
  const cueListName = (id: string | null) => cueLists.find((l) => l.id === id)?.name ?? 'Cue list'

  const targetLabel = (m: MidiMapping): string => {
    if (m.targetType === 'blackout') return 'Blackout / Panic'
    if (m.targetType === 'master') return 'Master intensity'
    if (m.targetType === 'cue-next') return `Next cue · ${cueListName(m.targetId)}`
    if (m.targetType === 'cue-prev') return 'Previous cue'
    if (m.targetType === 'tap-tempo') return 'Tap tempo'
    if (m.targetType === 'blind') return 'Blind'
    if (m.targetType === 'freeze') return 'Freeze'
    if (m.targetType === 'cue') return cueName(m.targetId) ?? 'Cue no longer exists'
    if (m.targetType === 'live-cue') {
      const control = (show?.livePages ?? []).flatMap((p) => p.controls).find((c) => c.id === m.targetId)
      return control ? `Live button · ${control.name}` : 'Live button no longer exists'
    }
    if (m.targetType === 'preset') return presets.find((p) => p.id === m.targetId)?.name ?? 'Preset'
    if (m.targetType === 'sequence') return show?.sequences?.find((s) => s.id === m.targetId)?.name ?? 'Sequence'
    return 'Cue'
  }

  // A mapping whose target is gone fires nothing and is shown as
  // unmappable in the list below — never silently dropped.
  const unmappedNote = (m: MidiMapping): string | null => {
    if (m.targetType === 'cue' && m.targetId && !findInlineCue(show, cueLists, m.targetId)) return 'Unmapped — this cue no longer exists. Learn a new trigger for a cue above, or remove this mapping.'
    if (m.targetType === 'live-cue' && m.targetId && !(show?.livePages ?? []).some((p) => p.controls.some((c) => c.id === m.targetId))) return 'Unmapped — this Live button no longer exists. Learn a new trigger for a button above, or remove this mapping.'
    if (m.targetType === 'cue-next' && m.targetId && !cueLists.some((l) => l.id === m.targetId)) return 'Unmapped — this cue list no longer exists. Learn a new trigger for a list above, or remove this mapping.'
    return null
  }

  // Live buttons (Jake, 27 Nov 2026 — LightKey's "Add Trigger…" learns
  // a MIDI trigger for the button itself; until now the bind list had
  // no row for a Live button, so there was no way to learn one from
  // Settings either). With several pages the page name disambiguates.
  const livePages = show?.livePages ?? []
  const liveButtons: LearnTarget[] = livePages.flatMap((page) =>
    page.controls.map((control) => ({
      targetType: 'live-cue' as const,
      targetId: control.id,
      label: livePages.length > 1 ? `${page.name} · ${control.name}` : control.name,
    }))
  )

  // Every inline cue, one learn row per holder (see cueName above):
  // a button's cue is labelled with its page, a step's cue with its
  // list, so two copies of the "same" cue stay distinguishable.
  const inlineCueTargets: LearnTarget[] = [
    ...livePages.flatMap((page) =>
      page.controls.filter((control) => control.cue).map((control) => ({
        targetType: 'cue' as const,
        targetId: control.cue!.id,
        label: `${control.cue!.name} · ${page.name}`,
      }))
    ),
    ...cueLists.flatMap((list) =>
      list.steps.map((step) => ({
        targetType: 'cue' as const,
        targetId: step.cue.id,
        label: `${step.cue.name} · ${list.name}`,
      }))
    ),
  ]

  const learnButton = (target: LearnTarget) => {
    const armed = armedFor(target.targetId, target.targetType)
    return (
      <button
        onClick={() => (armed ? disarm() : arm(target))}
        className={`rounded px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${
          armed ? 'bg-amber-500 text-black animate-pulse' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
        }`}
      >
        {armed ? 'Learning…' : 'Learn'}
      </button>
    )
  }

  const bindRow = (target: LearnTarget) => (
    <div
      key={`${target.targetType}:${target.targetId ?? 'none'}`}
      className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950 px-3 py-2"
    >
      <span className="text-xs font-medium text-zinc-200">{target.label}</span>
      {learnButton(target)}
    </div>
  )

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
          MIDI Mapping
        </h2>
        <div className="flex items-center gap-2">
          {(midiState === 'denied' || midiState === 'timeout') && (
            <button
              onClick={retry}
              className="rounded bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              Retry
            </button>
          )}
          <span className={`text-[10px] px-2 py-1 rounded uppercase tracking-wider ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {midiState === 'unsupported' && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 px-4 py-3 text-xs text-zinc-400">
          Web MIDI isn’t available in this environment. Open OpenLights in its desktop app (not a
          plain browser) and connect a MIDI controller.
        </div>
      )}

      {(midiState === 'denied' || midiState === 'timeout') && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Connected MIDI Devices
        </h3>
        {inputs.length === 0 ? (
          <div className="text-xs text-zinc-500">
            No MIDI inputs detected. Plug in a controller — the list updates automatically.
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {inputs.map((name) => (
              <li key={name} className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200">
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Bind a Control
        </h3>
        <p className="text-xs text-zinc-500 mb-3">
          Click <span className="text-zinc-300">Learn</span> next to a target, then move any control
          on your MIDI device. Notes and CCs are both supported.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <h4 className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
              Master
            </h4>
            <div className="flex flex-col gap-2">
              {bindRow({ targetType: 'blackout', targetId: null, label: 'Blackout / Panic' })}
              {bindRow({ targetType: 'master', targetId: null, label: 'Master intensity (CC)' })}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
              Cue Lists
            </h4>
            <div className="flex flex-col gap-2">
              {cueLists.length === 0 && (
                <div className="px-3 py-2 text-xs text-zinc-600">No cue lists yet.</div>
              )}
              {cueLists.map((list) =>
                bindRow({
                  targetType: 'cue-next',
                  targetId: list.id,
                  label: `Next cue · ${list.name}`
                })
              )}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
              Cues
            </h4>
            <div className="flex flex-col gap-2">
              {inlineCueTargets.length === 0 && (
                <div className="px-3 py-2 text-xs text-zinc-600">No cues yet.</div>
              )}
              {inlineCueTargets.map((target) => bindRow(target))}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
              Live Buttons
            </h4>
            <div className="flex flex-col gap-2">
              {liveButtons.length === 0 && (
                <div className="px-3 py-2 text-xs text-zinc-600">No Live buttons yet.</div>
              )}
              {liveButtons.map((target) => bindRow(target))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="px-4 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Active Mappings ({midiMappings.length})
        </div>
        {midiMappings.length === 0 ? (
          <div className="px-4 pb-4 text-xs text-zinc-600">No mappings yet — learn one above.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-800">
            {midiMappings.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <div className="text-xs font-medium text-zinc-200">{targetLabel(m)}</div>
                  <div className="text-[10px] text-zinc-500">{describeMapping(m)}</div>
                  {unmappedNote(m) && <div className="text-[10px] text-amber-400">{unmappedNote(m)}</div>}
                </div>
                <button
                  onClick={() => removeMidiMapping(m.id)}
                  className="text-[10px] text-zinc-500 hover:text-red-400"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {learnTarget && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          Listening for MIDI input for “{learnTarget.label}”… move a control now, or{' '}
          <button onClick={disarm} className="underline hover:text-amber-200">
            cancel
          </button>
        </div>
      )}
    </section>
  )
}
