import { useEffect, useState } from 'react'
import type { FanDef, FixtureDef } from '@shared/types'
import { availableProperties } from '../lib/availableProperties'
import { clearFanRowValue, fanRows, FAN_MODE_OPTIONS, FAN_ORDER_OPTIONS, setFanRowValue } from '../lib/fanningHud'

function attributeLabel(attribute: string) {
  return attribute.charAt(0).toUpperCase() + attribute.slice(1)
}

// Number input that commits on blur / Enter instead of every keystroke, so
// typing a value does not save a fan (and an undo step) per digit.
function NumberField({ value, min, max, label, disabled, onCommit }: {
  value: number
  min: number
  max: number
  label: string
  disabled?: boolean
  onCommit: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = () => {
    const next = Number(text)
    if (!Number.isFinite(next)) { setText(String(value)); return }
    if (next !== value) onCommit(Math.max(min, Math.min(max, next)))
    else setText(String(value))
  }
  return <input
    type="number"
    aria-label={label}
    title={label}
    value={text}
    min={min}
    max={max}
    disabled={disabled}
    onChange={(event) => setText(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') { setText(String(value)); (event.target as HTMLInputElement).blur() } }}
    className="w-16 rounded border border-line bg-panel2 px-1 py-0.5 text-xs text-text disabled:opacity-40"
  />
}

interface FanningHudProps {
  draft: FanDef
  fixtures: FixtureDef[]
  fans: FanDef[]
  selectedCount: number
  hasActiveCue: boolean
  onCommit: (next: FanDef) => void
  onEditFan: (fan: FanDef) => void
  onNewFan: () => void
  onDeleteFan: (id: string, keepValues: boolean) => void
  onClose: () => void
}

// The Fanning HUD (LightKey Guide §8, p.118 to 123). In LightKey the HUD
// appears around the fixtures' icons in the Preview once fanning is added
// from a property's menu; OpenLights has no per-property menu in the Design
// view and no Fixture > Select Property menu, so this panel opens from the
// Preview toolbar's Fan button instead (see NOTES.md) and lives here, in
// the Preview — not in the Design panel, which LightKey gives no fanning
// control. The fixture list is the editor: the first and last rows are the
// fan's endpoints (start/end) and any row in between sets an intermediate
// anchor the fan interpolates through (Guide p.121). Blue dots mark the
// fixtures with a defined value, on the rows and on the canvas icons.
export function FanningHud({ draft, fixtures, fans, selectedCount, hasActiveCue, onCommit, onEditFan, onNewFan, onDeleteFan, onClose }: FanningHudProps) {
  const isCreating = draft.id === ''
  const draftFixtures = fixtures.filter((f) => draft.fixtureIds.includes(f.id))
  const channels = availableProperties(draftFixtures)
  const channel = channels.find((c) => c.attribute === draft.attribute)
  const rows = fanRows(fixtures, draft)
  // Guide p.119: fan at least three fixtures (or one fixture with at
  // least three beams — beams are not fanned yet, see NOTES.md).
  const canCreate = selectedCount >= 3
  const editingDisabled = isCreating && !canCreate
  const min = channel?.min ?? 0, max = channel?.max ?? 255

  return (
    <div role="dialog" aria-label="Fanning HUD" className="absolute left-3 top-12 z-20 max-h-[calc(100%-4rem)] w-[21rem] overflow-y-auto rounded border border-line bg-panel p-3 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-xs">Fanning — {attributeLabel(draft.attribute)}</strong>
        <button type="button" onClick={onClose} className="rounded bg-panel2 px-2 py-1 text-xs">Done</button>
      </div>
      <p className="mt-1 text-[10px] text-dim">
        {isCreating ? `New fan across ${draft.fixtureIds.length} selected fixture${draft.fixtureIds.length === 1 ? '' : 's'}` : `Editing fan across ${draft.fixtureIds.length} fixture${draft.fixtureIds.length === 1 ? '' : 's'}`}
        {!hasActiveCue && ' — saving starts a new cue'}
      </p>
      {isCreating && !canCreate && (
        <p className="mt-2 rounded bg-panel2 p-2 text-[11px] text-text">Select at least three fixtures to fan a property (Guide §8, p.119). Fans already saved on the active cue can still be edited below.</p>
      )}
      {channels.length === 0 ? (
        <p className="mt-2 text-[11px] text-dim">No fannable properties on these fixtures.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="text-[10px] text-dim">Property
              <select aria-label="Fanned property" value={draft.attribute} disabled={editingDisabled} onChange={(event) => { const next = channels.find((c) => c.attribute === event.target.value); if (!next) return; onCommit({ ...draft, attribute: next.attribute, start: next.min, end: next.max, anchors: undefined }) }} className="ml-1 rounded border border-line bg-panel2 px-1 py-1 text-xs text-text disabled:opacity-40">
                {channels.map((c) => <option key={c.attribute} value={c.attribute}>{attributeLabel(c.attribute)}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-dim">Shape
              <select aria-label="Fan shape" value={draft.mode} disabled={editingDisabled} onChange={(event) => onCommit({ ...draft, mode: event.target.value as FanDef['mode'] })} className="ml-1 rounded border border-line bg-panel2 px-1 py-1 text-xs text-text disabled:opacity-40">
                {FAN_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-dim">Order
              <select aria-label="Fixture order" value={draft.order} disabled={editingDisabled} onChange={(event) => onCommit({ ...draft, order: event.target.value as FanDef['order'] })} className="ml-1 rounded border border-line bg-panel2 px-1 py-1 text-xs text-text disabled:opacity-40">
                {FAN_ORDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] text-dim">
              <input type="checkbox" checked={Boolean(draft.considerSpacing)} disabled={editingDisabled} onChange={(event) => onCommit({ ...draft, considerSpacing: event.target.checked })} />
              Consider spacing
            </label>
          </div>

          <div className="mt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-dim">Fixtures — set a value per fixture</div>
            {rows.length === 0 && <p className="mt-1 text-[11px] text-dim">No fixtures in this fan.</p>}
            {rows.map((row) => {
              const isFirst = row.index === 0, isLast = row.index === rows.length - 1
              return (
                <div key={row.fixture.id} className="mt-1 flex items-center gap-2 text-xs">
                  <span title={row.defined ? 'Defined value' : 'Calculated value'} aria-label={row.defined ? `Defined value for ${row.fixture.name}` : `Calculated value for ${row.fixture.name}`} className={row.defined ? 'text-sm leading-none text-blue-400' : 'text-sm leading-none text-dim'}>●</span>
                  <span className="min-w-0 flex-1 truncate">{row.fixture.name}{isFirst ? ' · first' : isLast ? ' · last' : ''}</span>
                  {row.value === null ? (
                    <span className="text-dim">—</span>
                  ) : (
                    <NumberField
                      value={row.value}
                      min={min}
                      max={max}
                      label={`${row.fixture.name} ${attributeLabel(draft.attribute)} value`}
                      disabled={editingDisabled}
                      onCommit={(value) => onCommit(setFanRowValue(draft, row.index, value, rows.length))}
                    />
                  )}
                  {row.defined && !isFirst && !isLast && (
                    <button type="button" title={`Clear defined value for ${row.fixture.name}`} aria-label={`Clear defined value for ${row.fixture.name}`} disabled={editingDisabled} onClick={() => onCommit(clearFanRowValue(draft, row.index, rows.length))} className="px-1 text-xs text-dim hover:text-white disabled:opacity-40">×</button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {fans.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-dim">Saved fans on this cue</span>
            {!isCreating && <button type="button" onClick={onNewFan} className="text-[11px] text-text underline">+ New fan</button>}
          </div>
          {fans.map((fan) => (
            <div key={fan.id} className="mt-1 flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{attributeLabel(fan.attribute)} · {FAN_MODE_OPTIONS.find((o) => o.value === fan.mode)?.label ?? fan.mode} · {fan.fixtureIds.length} fixtures</span>
              {fan.id === draft.id
                ? <span className="text-[10px] text-dim">Editing</span>
                : <button type="button" onClick={() => onEditFan(fan)} className="text-text underline">Edit</button>}
              <button type="button" title="Delete fanning and keep the fanned values (Guide p.122)" onClick={() => onDeleteFan(fan.id, true)} className="text-text underline">Keep values</button>
              <button type="button" title="Delete fanning and clear the property (Guide p.123)" onClick={() => onDeleteFan(fan.id, false)} className="text-red-300 underline">Clear</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
