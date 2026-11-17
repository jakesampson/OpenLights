import { useEffect, useMemo, useRef, useState } from 'react'
import { previewFixtureValues } from '../lib/previewOutput'
import { useShowStore } from '../stores/showStore'
import type { FixtureDef, SceneDef } from '@shared/types'

interface Pos { x: number; y: number }
interface FixtureView extends FixtureDef {
  pos: Pos
  intensity: number
  color: string
}

function clamp(v: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, v))
}

function averageAttribute(values: Record<string, number>, attribute: string) {
  const attributes = [
    attribute,
    `${attribute}2`,
    `${attribute}3`,
    `${attribute}4`
  ].filter((key) => typeof values[key] === 'number')
  if (attributes.length === 0) return 0
  return attributes.reduce((total, key) => total + values[key], 0) / attributes.length
}

export function fixtureColor(values?: Record<string, number>, dimmerOnly = false): string {
  if (!values) return '#5d3a72'
  if (dimmerOnly && !['red', 'green', 'blue'].some((attribute) => typeof values?.[attribute] === 'number')) {
    values = { ...values, red: 255, green: 255, blue: 255 }
  }
  const dim = clamp(values.intensity ?? 255, 0, 255) / 255
  const white = values.white ?? 0
  const amber = values.amber ?? 0
  const r = Math.round(clamp(averageAttribute(values, 'red') + white + amber) * dim)
  const g = Math.round(
    clamp(averageAttribute(values, 'green') + white + amber * 0.45) * dim
  )
  const b = Math.round(clamp(averageAttribute(values, 'blue') + white) * dim)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function fixturePositions(count: number) {
  // Overhead truss arc + floor positions.
  const positions: Array<{ x: number; y: number }> = []
  const overhead = Math.min(count, 6)

  // Spread fixtures evenly along the full truss arc (x 40..760), following
  // the quadratic curve y = 80 - 84·t·(1 - t) so they sit on the truss.
  for (let i = 0; i < overhead; i++) {
    const t = (i + 0.5) / overhead
    const x = 40 + 720 * t
    const y = 80 - 84 * t * (1 - t)
    positions.push({ x, y })
  }

  // Remaining fixtures go on the stage deck as up-lights.
  const floorCount = Math.max(0, count - overhead)
  for (let i = 0; i < floorCount; i++) {
    const t = (i + 0.5) / floorCount
    positions.push({ x: 40 + 720 * t, y: 300 })
  }

  return positions.slice(0, count)
}

export function StagePreview() {
  const { show, activeSceneId, selectedFixtureIds, selectFixture, selectFixtures, setFixturePosition } = useShowStore()
  const [editing, setEditing] = useState(false)
  const [outputChannels, setOutputChannels] = useState<number[]>([])
  useEffect(() => {
    let alive = true
    let pending = false
    const readOutput = async () => {
      if (pending || !window.electronAPI?.getChannels) return
      pending = true
      try { const values = await window.electronAPI.getChannels(); if (alive) setOutputChannels(values) }
      catch { /* Keep the last known output if the bridge is unavailable. */ }
      finally { pending = false }
    }
    void readOutput()
    const timer = window.setInterval(readOutput, 100)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])
  const [zoom, setZoom] = useState(1)
  const [dragPosition, setDragPosition] = useState<{ id: string; position: Pos } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ id: string; position: Pos } | null>(null)
  const pointAt = (event: React.PointerEvent) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const result = point.matrixTransform(matrix.inverse())
    return { x: Math.round(clamp(result.x, 0, 800)), y: Math.round(clamp(result.y, 0, 340)) }
  }
  const fixtures: FixtureDef[] = show?.fixtures ?? []
  const scenes: SceneDef[] = show?.scenes ?? []
  const activeScene = activeSceneId ? scenes.find((s) => s.id === activeSceneId) : null

  const fixtureViews = useMemo((): FixtureView[] => {
    const count = fixtures.length || 8 // demo rig when nothing patched
    const positions = fixturePositions(count)

    return positions.map((pos, i) => {
      if (fixtures.length > 0) {
        const f = fixtures[i]
        const values = previewFixtureValues(f, outputChannels, activeScene?.fixtureValues[f.id])
        return {
          ...f,
          pos: dragPosition?.id === f.id ? dragPosition.position : f.previewPosition ?? pos,
          intensity: values.intensity ?? Math.max(values.red ?? 0, values.green ?? 0, values.blue ?? 0, values.white ?? 0, values.amber ?? 0),
          color: fixtureColor(values, f.type === 'dimmer')
        }
      }
      return {
        id: `demo-${i}`,
        name: `Demo Light ${i + 1}`,
        type: i < 4 ? 'par' : 'moving-head',
        channelStart: i + 1,
        channels: 4,
        pos: { x: pos.x, y: pos.y },
        intensity: 170,
        color: '#c24bd6'
      }
    })
  }, [fixtures, activeScene, dragPosition, outputChannels])

  return (
    <div className="panel stage min-h-0 overflow-hidden relative bg-bg p-2">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1">
        <span className="rounded bg-bg/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-dim">Preview</span>
        <button type="button" onClick={() => { setEditing(!editing); setDragPosition(null); dragRef.current = null }} className={`rounded px-2 py-1 text-xs ${editing ? 'bg-text text-bg' : 'bg-panel2 text-text'}`} aria-pressed={editing}>{editing ? 'Done' : 'Edit layout'}</button>
        {editing && <span className="rounded bg-bg/80 px-2 py-1 text-[10px] text-dim">Drag fixtures to position them</span>}
      </div>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded bg-bg/80 p-1">
        <button type="button" aria-label="Zoom out preview" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="px-2 text-sm text-text">−</button>
        <button type="button" onClick={() => setZoom(1)} className="px-1 text-[10px] text-dim" title="Reset preview zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in preview" onClick={() => setZoom((z) => Math.min(2, z + 0.25))} className="px-2 text-sm text-text">+</button>
      </div>
      <svg
        ref={svgRef}
        className="h-full w-full"
        viewBox={`${400 - 400 / zoom} ${170 - 170 / zoom} ${800 / zoom} ${340 / zoom}`}
        onPointerMove={(event) => { if (!dragRef.current) return; const position = pointAt(event); if (position) { dragRef.current = { ...dragRef.current, position }; setDragPosition(dragRef.current) } }}
        onPointerUp={(event) => { if (!dragRef.current) return; const drag = dragRef.current; dragRef.current = null; setDragPosition(null); setFixturePosition(drag.id, drag.position); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onPointerCancel={() => { dragRef.current = null; setDragPosition(null) }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Stage glow background */}
        <defs>
          <radialGradient id="stageGlow" cx="50%" cy="95%" r="65%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--bg)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="800" height="340" fill="url(#stageGlow)" onClick={() => { if (!editing) selectFixtures([]) }} />

        {/* Truss curves */}
        <path d="M 40 80 Q 400 38 760 80" fill="none" stroke="var(--line)" strokeWidth="3" />
        <path d="M 40 92 Q 400 50 760 92" fill="none" stroke="var(--line)" strokeWidth="2" opacity="0.7" />
        <path d="M 64 80 L 64 92 M 200 65 L 200 77 M 336 60 L 336 72 M 464 60 L 464 72 M 600 65 L 600 77 M 736 80 L 736 92" stroke="var(--line)" strokeWidth="2" opacity="0.7" />
        <path d="M 40 80 L 40 300 M 760 80 L 760 300" stroke="var(--line)" strokeWidth="2" opacity="0.5" />

        {/* Beams */}
        {fixtureViews.map((f) => {
          const x = f.pos.x
          const y = f.pos.y
          const on = f.intensity > 0
          const op = Math.min(f.intensity / 255, 1)
          // Truss fixtures aim down at the deck; floor fixtures aim up.
          const floorFixture = y > 200
          const top = floorFixture ? y - 4 : y + 4
          const bottom = floorFixture ? y - 150 : y + 150
          const selectable = fixtures.length > 0
          const selected = selectable && selectedFixtureIds.includes(f.id)
          return (
            <g
              key={f.id}
              role={selectable ? 'button' : undefined}
              tabIndex={selectable ? 0 : undefined}
              aria-label={selectable ? f.name : undefined}
              aria-pressed={selectable ? selected : undefined}
              style={selectable ? { cursor: editing ? 'grab' : 'pointer', touchAction: 'none' } : undefined}
              onPointerDown={selectable && editing ? (event) => { event.preventDefault(); event.stopPropagation(); const position = pointAt(event); if (position) { dragRef.current = { id: f.id, position }; setDragPosition(dragRef.current); svgRef.current?.setPointerCapture(event.pointerId) } } : undefined}
              onClick={
                selectable
                  ? (event) => {
                      event.stopPropagation()
                      if (!editing) selectFixture(f.id, event.shiftKey)
                    }
                  : undefined
              }
              onKeyDown={
                selectable
                  ? (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      selectFixture(f.id, event.shiftKey)
                    }
                  : undefined
              }
            >
              {on && (
                <polygon
                  points={`${x - 7},${top} ${x + 7},${top} ${x + 34},${bottom} ${x - 34},${bottom}`}
                  fill={f.color}
                  fillOpacity={op * 0.28}
                  stroke={f.color}
                  strokeOpacity={op * 0.45}
                  strokeWidth="1"
                />
              )}
              {selectable && <text x={x} y={y - 13} textAnchor="middle" fill="var(--text)" fontSize="8" paintOrder="stroke" stroke="var(--bg)" strokeWidth="2">{f.name}</text>}
              {selected && (
                <circle
                  cx={x}
                  cy={y}
                  r="9"
                  fill="var(--accent)"
                  fillOpacity="0.22"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r="5"
                fill={on ? f.color : 'var(--panel2)'}
                stroke={selected ? 'var(--accent)' : 'var(--line)'}
                strokeWidth={selected ? '2' : '1.5'}
              />
              <circle
                cx={x}
                cy={y}
                r="16"
                fill="transparent"
                pointerEvents="all"
                aria-hidden="true"
              />
            </g>
          )
        })}

        {/* Stage deck */}
        <rect x="30" y="296" width="740" height="28" rx="3" fill="var(--panel)" stroke="var(--line)" />
        <line x1="30" y1="296" x2="770" y2="296" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />

        {/* Performer silhouettes */}
        <g fill="var(--bg)" opacity="0.9">
          <circle cx="340" cy="284" r="6" />
          <path d="M 335 290 Q 340 288 345 290 L 346 306 L 334 306 Z" />
          <circle cx="450" cy="284" r="6" />
          <path d="M 445 290 Q 450 288 455 290 L 456 306 L 444 306 Z" />
        </g>

        {fixtures.length === 0 && (
          <text x="400" y="200" textAnchor="middle" fill="var(--dim)" fontSize="9" letterSpacing="0.08em">
            DEMO RIG — NO FIXTURES PATCHED
          </text>
        )}
      </svg>
    </div>
  )
}

