import { useEffect, useRef, useState } from 'react'
import type { FanDef, FixtureDef } from '@shared/types'
import { clearFanRowValue, fanBeamTargets, fanRows, FAN_MODE_OPTIONS, FAN_ORDER_OPTIONS, fannableProperties, setFanRowColor, setFanRowValue } from '../lib/fanningHud'

function attributeLabel(attribute: string) {
  if (attribute === 'intensity') return 'Dimmer'
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

// Colour input that commits on the native picker's change event (when the
// picker is dismissed) or on blur — not on every input event, so dragging
// through colours does not save a fan (and an undo step) per shade. The
// same commit-on-blur/Enter discipline as NumberField above.
function ColorField({ value, label, disabled, onCommit }: {
  value: string
  label: string
  disabled?: boolean
  onCommit: (value: string) => void
}) {
  const [hex, setHex] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setHex(value) }, [value])
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const commit = () => { if (el.value !== value) onCommit(el.value) }
    el.addEventListener('change', commit)
    return () => el.removeEventListener('change', commit)
  }, [value, onCommit])
  return <input
    ref={inputRef}
    type="color"
    aria-label={label}
    title={label}
    value={hex}
    disabled={disabled}
    onChange={(event) => setHex(event.target.value)}
    onBlur={() => { if (hex !== value) onCommit(hex) }}
    className="h-6 w-10 cursor-pointer rounded border border-line bg-panel2 p-0.5 disabled:opacity-40"
  />
}

interface FanningHudProps {
  draft: FanDef
  fixtures: FixtureDef[]
  fans: FanDef[]
  selectedCount: number
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
export function FanningHud({ draft, fixtures, fans, selectedCount, onCommit, onEditFan, onNewFan, onDeleteFan, onClose }: FanningHudProps) {
  const isCreating = draft.id === ''
  const draftFixtures = fixtures.filter((f) => draft.fixtureIds.includes(f.id))
  const channels = fannableProperties(draftFixtures)
  const channel = channels.find((c) => c.attribute === draft.attribute)
  const isColor = draft.attribute === 'color'
  const rows = fanRows(fixtures, draft)
  // Guide p.119: fan at least three fixtures — or one fixture with at
  // least three beams. The HUD offers beams vs fixtures for a
  // multi-beam fixture; a beam fan spreads over the fixture's cells.
  const draftBeams = fanBeamTargets(fixtures, draft.fixtureIds)
  const canCreate = selectedCount >= 3 || draftBeams.length >= 3
  const editingDisabled = isCreating && !canCreate
  const min = channel?.min ?? 0, max = channel?.max ?? 255

  return (
    <div role="dialog" aria-label="Fanning HUD" className="absolute left-3 top-12 z-20 max-h-[calc(100%-4rem)] w-[21rem] overflow-y-auto rounded border border-line bg-panel p-3 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-xs">Fanning — {attributeLabel(draft.attribute)}</strong>
        <button type="button" onClick={onClose} className="rounded bg-panel2 px-2 py-1 text-xs">Done</button>
      </div>
      <p className="mt-1 text-[10px] text-dim">
        {isCreating ? `New fan across ${draft.beams ? `${draft.beams.length} beam${draft.beams.length === 1 ? '' : 's'}` : `${draft.fixtureIds.length} selected fixture${draft.fixtureIds.length === 1 ? '' : 's'}`}` : `Editing fan across ${draft.beams ? `${draft.beams.length} beam${draft.beams.length === 1 ? '' : 's'}` : `${draft.fixtureIds.length} fixture${draft.fixtureIds.length === 1 ? '' : 's'}`}`}
      </p>
      {isCreating && !canCreate && (
        <p className="mt-2 rounded bg-panel2 p-2 text-[11px] text-text">Select at least three fixtures — or one fixture with at least three beams — to fan a property (Guide §8, p.119). Fans already saved can still be edited below.</p>
      )}
      {channels.length === 0 ? (
        <p className="mt-2 text-[11px] text-dim">No fannable properties on these fixtures.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="text-[10px] text-dim">Property
              <select aria-label="Fanned property" value={draft.attribute} disabled={editingDisabled} onChange={(event) => { const next = channels.find((c) => c.attribute === event.target.value); if (!next) return; onCommit(next.attribute === 'color' ? { ...draft, attribute: 'color', startColor: '#ff0000', endColor: '#0000ff', anchors: undefined } : { ...draft, attribute: next.attribute, start: next.min, end: next.max, anchors: undefined }) }} className="ml-1 rounded border border-line bg-panel2 px-1 py-1 text-xs text-text disabled:opacity-40">
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
            {draftBeams.length > 0 && (
              <label className="text-[10px] text-dim">Fan across
                <select aria-label="Fan across fixtures or beams" value={draft.beams ? 'beams' : 'fixtures'} disabled={editingDisabled} onChange={(event) => { if (event.target.value === 'beams') onCommit({ ...draft, beams: draftBeams, anchors: undefined }); else onCommit({ ...draft, beams: undefined, anchors: undefined }) }} className="ml-1 rounded border border-line bg-panel2 px-1 py-1 text-xs text-text disabled:opacity-40">
                  <option value="fixtures">Fixtures</option>
                  <option value="beams">Beams</option>
                </select>
              </label>
            )}
          </div>

          <div className="mt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-dim">{draft.beams ? 'Beams' : 'Fixtures'} — set a {isColor ? 'colour' : 'value'} per {draft.beams ? 'beam' : 'fixture'}</div>
            {rows.length === 0 && <p className="mt-1 text-[11px] text-dim">No {draft.beams ? 'beams' : 'fixtures'} in this fan.</p>}
            {rows.map((row) => {
              const isFirst = row.index === 0, isLast = row.index === rows.length - 1
              const rowName = row.beam ? `${row.fixture.name} · ${row.beam.name}` : row.fixture.name
              return (
                <div key={row.beam ? `${row.fixture.id}:${row.beam.id}` : row.fixture.id} className="mt-1 flex items-center gap-2 text-xs">
                  <span title={row.defined ? 'Defined value' : 'Calculated value'} aria-label={row.defined ? `Defined value for ${rowName}` : `Calculated value for ${rowName}`} className={row.defined ? 'text-sm leading-none text-blue-400' : 'text-sm leading-none text-dim'}>●</span>
                  <span className="min-w-0 flex-1 truncate">{rowName}{isFirst ? ' · first' : isLast ? ' · last' : ''}</span>
                  {isColor ? (
                    row.colorValue ? (
                      <ColorField
                        value={row.colorValue}
                        label={`${rowName} colour`}
                        disabled={editingDisabled}
                        onCommit={(value) => onCommit(setFanRowColor(draft, row.index, value, rows.length))}
                      />
                    ) : (
                      <span className="text-dim">—</span>
                    )
                  ) : row.value === null ? (
                    <span className="text-dim">—</span>
                  ) : (
                    <NumberField
                      value={row.value}
                      min={min}
                      max={max}
                      label={`${rowName} ${attributeLabel(draft.attribute)} value`}
                      disabled={editingDisabled}
                      onCommit={(value) => onCommit(setFanRowValue(draft, row.index, value, rows.length))}
                    />
                  )}
                  {row.defined && !isFirst && !isLast && (
                    <button type="button" title={`Clear defined value for ${rowName}`} aria-label={`Clear defined value for ${rowName}`} disabled={editingDisabled} onClick={() => onCommit(clearFanRowValue(draft, row.index, rows.length))} className="px-1 text-xs text-dim hover:text-white disabled:opacity-40">×</button>
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
            <span className="text-[10px] font-semibold uppercase tracking-wide text-dim">Saved fans</span>
            {!isCreating && <button type="button" onClick={onNewFan} className="text-[11px] text-text underline">+ New fan</button>}
          </div>
          {fans.map((fan) => (
            <div key={fan.id} className="mt-1 flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{attributeLabel(fan.attribute)} · {FAN_MODE_OPTIONS.find((o) => o.value === fan.mode)?.label ?? fan.mode} · {fan.beams ? `${fan.beams.length} beams` : `${fan.fixtureIds.length} fixtures`}</span>
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
