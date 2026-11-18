import type { SequenceStep } from '@shared/types'
import { useShowStore } from '../stores/showStore'

/**
 * Sequence editor (LightKey guide ch.9, "Create a sequence", p.131).
 *
 * Sequences are chases: ordered steps, each step a captured look (fixture
 * values and/or presets) with its own fade and hold. Playback is the
 * existing time-driven engine (`sequenceClock.ts` via `configureSequences`):
 * Run starts the clock from step 1, Stop releases it. There is no manual
 * Go/Back or jump-to-step in the engine — the clock advances on elapsed
 * time — so this editor deliberately offers no fake step-advance buttons.
 * Adding those needs a step offset in the engine; see NOTES.md.
 *
 * One sequence at a time: the LightKey combined palette tree
 * (GroupsPresetsPanel) renders this editor inline under the selected
 * sequence row, and sequence creation now lives in the palette header menu
 * / right-click menu ("New Sequence", "Capture sequence" there calls
 * createSequence). The old whole-list rendering — its "Sequences" heading,
 * explanatory paragraph, name input and "No sequences yet…" block — is
 * gone with the split Presets/Sequences palette sections; sequences are
 * tree rows now, draggable from the row itself (see GroupsPresetsPanel).
 * Each sequence carries `data-project-id` so ProjectSearch can jump to it.
 */
export function SequenceEditor({ sequenceId }: { sequenceId: string }) {
  const {
    show,
    presets,
    activeSequenceIds,
    toggleSequence,
    updateSequence,
    updateSequenceStep,
    deleteSequence,
    duplicateSequence,
    addSequenceStep,
    removeSequenceStep,
    duplicateSequenceStep,
    moveSequenceStep,
    reorderSequenceSteps
  } = useShowStore()
  const sequences = show?.sequences ?? []
  const fixtures = show?.fixtures ?? []
  const sequence = sequences.find((item) => item.id === sequenceId)
  if (!sequence) return null
  const running = activeSequenceIds.includes(sequence.id)

  return (
    <div data-project-id={sequence.id} className="my-2 rounded border border-line p-2 text-xs" aria-label={`Sequence ${sequence.name}`}>
            <div className="my-2 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-theme" onClick={() => toggleSequence(sequence.id)}>
                {running ? 'Stop' : 'Run'}
              </button>
              <label>
                Name
                <input
                  aria-label={`Name of sequence ${sequence.name}`}
                  value={sequence.name}
                  onChange={(event) => updateSequence(sequence.id, { name: event.target.value })}
                  className="ml-1 rounded bg-bg p-1"
                />
              </label>
              <button type="button" onClick={() => duplicateSequence(sequence.id)}>Duplicate</button>
              <button
                type="button"
                className="text-red-300"
                onClick={() => { if (confirm(`Delete sequence “${sequence.name}”?`)) deleteSequence(sequence.id) }}
              >
                Delete
              </button>
            </div>
            <div className="my-2 flex flex-wrap items-center gap-2">
              <label>
                Timing
                <select
                  aria-label={`Timing of sequence ${sequence.name}`}
                  value={sequence.timing}
                  onChange={(event) => updateSequence(sequence.id, { timing: event.target.value as 'manual' | 'beat' })}
                  className="ml-1 rounded bg-bg p-1"
                >
                  <option value="manual">Seconds</option>
                  <option value="beat">Beat controlled</option>
                </select>
              </label>
              {sequence.timing === 'beat' ? (
                <label>
                  Steps / beat
                  <input
                    aria-label={`Steps per beat of sequence ${sequence.name}`}
                    type="number"
                    min={0.125}
                    step={0.125}
                    value={sequence.stepsPerBeat}
                    onChange={(event) => updateSequence(sequence.id, { stepsPerBeat: Math.max(0.125, Number(event.target.value) || 0.125) })}
                    className="ml-1 w-16 rounded bg-bg p-1"
                  />
                </label>
              ) : (
                <label>
                  Time scale
                  <input
                    aria-label={`Time scale of sequence ${sequence.name}`}
                    type="number"
                    min={0.01}
                    step={0.1}
                    value={sequence.timeScale ?? 1}
                    onChange={(event) => updateSequence(sequence.id, { timeScale: Math.max(0.01, Number(event.target.value) || 1) })}
                    className="ml-1 w-16 rounded bg-bg p-1"
                  />
                </label>
              )}
              <label>
                Order
                <select
                  aria-label={`Order of sequence ${sequence.name}`}
                  value={sequence.order}
                  onChange={(event) => updateSequence(sequence.id, { order: event.target.value as typeof sequence.order })}
                  className="ml-1 rounded bg-bg p-1"
                >
                  {(['forward', 'backward', 'bounce', 'random'] as const).map((order) => <option key={order} value={order}>{order}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={sequence.loop}
                  onChange={(event) => updateSequence(sequence.id, { loop: event.target.checked })}
                />
                Loop
              </label>
              <label>
                Repeats
                <input
                  aria-label={`Repeat count of sequence ${sequence.name}`}
                  type="number"
                  min={0}
                  step={1}
                  title="0 = play once, or loop if Loop is on"
                  value={sequence.repeatCount ?? 0}
                  onChange={(event) => updateSequence(sequence.id, { repeatCount: Math.max(0, Math.floor(Number(event.target.value) || 0)) || undefined })}
                  className="ml-1 w-14 rounded bg-bg p-1"
                />
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={Boolean(sequence.freezeOnCompletion)}
                  onChange={(event) => updateSequence(sequence.id, { freezeOnCompletion: event.target.checked })}
                />
                Keep last step
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-theme" onClick={() => addSequenceStep(sequence.id)}>
                Capture current look as step
              </button>
              <button type="button" onClick={() => reorderSequenceSteps(sequence.id, 'backward')}>Reverse steps</button>
              <button type="button" onClick={() => reorderSequenceSteps(sequence.id, 'random')}>Shuffle steps</button>
            </div>
            <p className="mt-1 text-dim">“Capture current look” stores the active scene plus any manual overrides as a new last step.</p>
            {sequence.steps.map((step, index) => (
              <StepEditor
                key={step.id}
                sequenceId={sequence.id}
                step={step}
                index={index}
                stepCount={sequence.steps.length}
                timing={sequence.timing}
                fixtures={fixtures}
                presets={presets}
                onPatch={(patch) => updateSequenceStep(sequence.id, step.id, patch)}
                onMove={(toIndex) => moveSequenceStep(sequence.id, step.id, toIndex)}
                onDuplicate={() => duplicateSequenceStep(sequence.id, step.id)}
                onRemove={() => removeSequenceStep(sequence.id, step.id)}
              />
            ))}
    </div>
  )
}

function StepEditor({ sequenceId, step, index, stepCount, timing, fixtures, presets, onPatch, onMove, onDuplicate, onRemove }: {
  sequenceId: string
  step: SequenceStep
  index: number
  stepCount: number
  timing: 'manual' | 'beat'
  fixtures: { id: string; name: string }[]
  presets: { id: string; name: string }[]
  onPatch: (patch: Partial<SequenceStep>) => void
  onMove: (toIndex: number) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const fixtureCount = Object.keys(step.fixtureValues).length
  const summary = `${fixtureCount} fixture${fixtureCount === 1 ? '' : 's'} · ${step.presetIds.length} preset${step.presetIds.length === 1 ? '' : 's'}${step.fans?.length ? ` · ${step.fans.length} fan${step.fans.length === 1 ? '' : 's'}` : ''}`
  return (
    <div className="my-2 rounded bg-panel2 p-2">
      <div className="mb-1 flex flex-wrap gap-2">
        <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>Up</button>
        <button type="button" disabled={index === stepCount - 1} onClick={() => onMove(index + 1)}>Down</button>
        <button type="button" onClick={onDuplicate}>Duplicate</button>
        <button type="button" className="text-red-300" onClick={onRemove}>Remove step</button>
        <span className="text-dim">{summary}</span>
      </div>
      <label>
        Step name
        <input
          aria-label={`Name of step ${index + 1} in sequence ${sequenceId}`}
          value={step.name}
          onChange={(event) => onPatch({ name: event.target.value })}
          className="ml-1 rounded bg-panel p-1"
        />
      </label>
      {timing === 'beat' && (
        <label className="ml-2">
          Beats
          <input
            aria-label={`Beats of step ${index + 1}`}
            type="number"
            min={0.125}
            step={0.125}
            value={step.beats ?? 1}
            onChange={(event) => onPatch({ beats: Math.max(0.125, Number(event.target.value) || 0.125) })}
            className="ml-1 w-16 rounded bg-panel p-1"
          />
        </label>
      )}
      {(['fadeMs', 'holdMs'] as const)
        .filter((key) => timing !== 'beat' || key === 'fadeMs')
        .map((key) => (
          <label key={key} className="ml-2">
            {key === 'fadeMs' ? 'Fade (s)' : 'Hold (s)'}
            <input
              aria-label={`${key === 'fadeMs' ? 'Fade' : 'Hold'} of step ${index + 1} in seconds`}
              type="number"
              min={0}
              step={0.1}
              value={step[key] / 1000}
              onChange={(event) => onPatch(key === 'fadeMs' ? { fadeMs: Math.max(0, Number(event.target.value) || 0) * 1000 } : { holdMs: Math.max(0, Number(event.target.value) || 0) * 1000 })}
              className="ml-1 w-16 rounded bg-panel p-1"
            />
          </label>
        ))}
      {presets.length > 0 && (
        <div className="mt-1">
          <span className="text-dim">Presets in this step:</span>
          {presets.map((preset) => (
            <label key={preset.id} className="mr-2">
              <input
                type="checkbox"
                checked={step.presetIds.includes(preset.id)}
                onChange={(event) => onPatch({ presetIds: event.target.checked ? [...step.presetIds, preset.id] : step.presetIds.filter((id) => id !== preset.id) })}
              />
              {preset.name}
            </label>
          ))}
        </div>
      )}
      {step.fans?.length ? (
        <p className="mt-1 text-dim">Fans stored on this step are applied at playback; fan editing per step is not in this editor yet.</p>
      ) : null}
      <details className="mt-1">
        <summary className="cursor-pointer">Stored fixture properties</summary>
        {fixtureCount === 0 && <p className="text-dim">This step holds no fixture values of its own — it plays only its presets.</p>}
        {Object.entries(step.fixtureValues).map(([fixtureId, values]) => (
          <div key={fixtureId} className="mt-1">
            <span>{fixtures.find((f) => f.id === fixtureId)?.name ?? fixtureId}</span>
            <button
              type="button"
              className="ml-2 text-red-300"
              onClick={() => {
                const next = { ...step.fixtureValues }
                delete next[fixtureId]
                onPatch({ fixtureValues: next })
              }}
            >
              Remove fixture
            </button>
            {Object.entries(values).map(([key, value]) => (
              <label key={key} className="m-1 inline-flex gap-1">
                {key}
                <input
                  aria-label={`${step.name} ${fixtureId} ${key}`}
                  type="number"
                  min={0}
                  max={255}
                  value={value}
                  onChange={(event) => onPatch({ fixtureValues: { ...step.fixtureValues, [fixtureId]: { ...values, [key]: Math.max(0, Math.min(255, Number(event.target.value) || 0)) } } })}
                  className="w-16 rounded bg-panel"
                />
              </label>
            ))}
          </div>
        ))}
      </details>
    </div>
  )
}
