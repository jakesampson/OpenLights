// One fixture's icon in the Preview, drawn like LightKey (Guide
// p.32): a distinct shape per fixture type, filled with the fixture's
// live colour while it is on and dark while it is off. Rendered inside
// the caller's transformed <g> (translate / rotate / iconSize scale),
// so rotation, icon size and the selection indicator all follow the
// icon. The LED bar is the exception: its housing is drawn with the
// cell rects in StagePreview (which share the cells' fixed spacing),
// so this component only draws its tick — unless the bar has fewer
// than two cells, in which case it draws a small bar here instead.
import type { FixtureIconKind } from '../lib/fixtureIcon'
import { fixtureIconIsRound, fixtureIconSelectionRect } from '../lib/fixtureIcon'

const WASH_DOTS: Array<[number, number]> = [
  [0, 0],
  [2.6, 0],
  [-2.6, 0],
  [1.3, 2.25],
  [-1.3, 2.25],
  [1.3, -2.25],
  [-1.3, -2.25]
]

const MATRIX_DOTS: Array<[number, number]> = [
  [-3, -3],
  [0, -3],
  [3, -3],
  [-3, 0],
  [0, 0],
  [3, 0],
  [-3, 3],
  [0, 3],
  [3, 3]
]

export function FixtureIcon({
  kind,
  x,
  y,
  on,
  color,
  selected,
  cells = 1,
  editing = false
}: {
  kind: FixtureIconKind
  x: number
  y: number
  on: boolean
  color: string
  selected: boolean
  /** Number of cells (beams) — an LED bar with fewer than two draws a small bar here. */
  cells?: number
  /** Edit mode: the blue surround + blue icon outline (Guide p.53).
   *  Outside edit mode a selected fixture shows LightKey's black box
   *  + blue label instead (Jake, 26 Nov 2026), drawn by StagePreview,
   *  so the icon keeps its normal outline there. */
  editing?: boolean
}) {
  const fill = on ? color : 'var(--panel2)'
  // Selected fixtures show LightKey's blue (Guide p.53 — the selected
  // fixture's blue handles and label), not the app's purple accent —
  // in edit mode only. Outside edit mode the LightKey selection box
  // (StagePreview) carries the selection, so the icon outline stays
  // its normal colour, as in Jake's LightKey screenshot.
  const stroke = selected && editing ? '#0A84FF' : 'var(--line)'
  const strokeWidth = selected && editing ? 2 : 1.5
  // Dark detail on a lit icon, dark detail on a dark (off) one.
  const detail = on ? 'rgba(0,0,0,0.55)' : 'var(--bg)'
  const line = on ? color : 'var(--line)'
  const isBar = kind === 'led-bar'
  const smallBar = isBar && cells < 2
  return (
    <>
      <line x1={x} y1={y} x2={x} y2={y - 8} stroke="var(--text)" strokeWidth="1.5" />
      {selected && editing &&
        (isBar && !smallBar ? null : fixtureIconIsRound(kind) && !smallBar ? (
          <circle cx={x} cy={y} r="9" fill="#0A84FF" fillOpacity="0.22" stroke="#0A84FF" strokeWidth="2" />
        ) : (
          (() => {
            const { halfWidth, halfHeight } = smallBar ? { halfWidth: 9.5, halfHeight: 6 } : fixtureIconSelectionRect(kind)
            return (
              <rect
                x={x - halfWidth}
                y={y - halfHeight}
                width={halfWidth * 2}
                height={halfHeight * 2}
                rx="3"
                fill="#0A84FF"
                fillOpacity="0.22"
                stroke="#0A84FF"
                strokeWidth="2"
              />
            )
          })()
        ))}
      {kind === 'par' && (
        <>
          <circle cx={x} cy={y} r="5.5" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
          {on && <circle cx={x} cy={y} r="2.6" fill="rgba(255,255,255,0.35)" />}
        </>
      )}
      {kind === 'wash' && (
        <>
          <circle cx={x} cy={y} r="5.5" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
          {WASH_DOTS.map(([dx, dy]) => (
            <circle key={`${dx},${dy}`} cx={x + dx} cy={y + dy} r="0.85" fill={detail} />
          ))}
        </>
      )}
      {kind === 'moving-head' && (
        <>
          <circle cx={x} cy={y} r="5.5" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
          <g transform={`translate(${x} ${y})`}>
            {[0, 120, 240].map((angle) => (
              <path key={angle} d="M0 0 L0 -4 A4 4 0 0 1 3.46 2 Z" transform={`rotate(${angle})`} fill={detail} />
            ))}
            <line x1={-7} y1={0} x2={-5.5} y2={0} stroke="var(--text)" strokeWidth="1.2" />
            <line x1={5.5} y1={0} x2={7} y2={0} stroke="var(--text)" strokeWidth="1.2" />
          </g>
        </>
      )}
      {kind === 'bulb' && <circle cx={x} cy={y} r="4" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />}
      {kind === 'generic' && (
        <rect x={x - 4.5} y={y - 4.5} width="9" height="9" rx="2" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      )}
      {kind === 'panel' && (
        <>
          <rect x={x - 5.5} y={y - 4.5} width="11" height="9" rx="1" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
          <line x1={x} y1={y - 4.5} x2={x} y2={y + 4.5} stroke={detail} strokeWidth="0.8" />
          <line x1={x - 5.5} y1={y} x2={x + 5.5} y2={y} stroke={detail} strokeWidth="0.8" />
        </>
      )}
      {kind === 'strobe' && (
        <rect x={x - 6} y={y - 3} width="12" height="6" rx="1" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      )}
      {kind === 'blinder' && (
        <>
          <rect x={x - 5.5} y={y - 4} width="11" height="8" rx="1" fill="var(--panel2)" stroke={stroke} strokeWidth={strokeWidth} />
          <circle cx={x - 2.75} cy={y} r="1.8" fill={on ? color : 'var(--bg)'} />
          <circle cx={x + 2.75} cy={y} r="1.8" fill={on ? color : 'var(--bg)'} />
        </>
      )}
      {kind === 'fog' && (
        <>
          <rect x={x - 4.5} y={y - 4.5} width="9" height="9" rx="2" fill="var(--panel2)" stroke={stroke} strokeWidth={strokeWidth} />
          <circle cx={x - 2} cy={y + 1} r="1.3" fill="var(--text)" />
          <circle cx={x} cy={y - 1} r="1.6" fill="var(--text)" />
          <circle cx={x + 2} cy={y + 1} r="1.3" fill="var(--text)" />
        </>
      )}
      {kind === 'switch' && (
        <>
          <rect x={x - 4.5} y={y - 4.5} width="9" height="9" rx="2" fill="var(--panel2)" stroke={stroke} strokeWidth={strokeWidth} />
          <line x1={x} y1={y - 2.5} x2={x} y2={y + 2.5} stroke="var(--text)" strokeWidth="1.4" />
        </>
      )}
      {kind === 'led-matrix' && (
        <>
          <rect x={x - 5.5} y={y - 5.5} width="11" height="11" rx="1" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
          {MATRIX_DOTS.map(([dx, dy]) => (
            <circle key={`${dx},${dy}`} cx={x + dx} cy={y + dy} r="0.8" fill={detail} />
          ))}
        </>
      )}
      {kind === 'led-strip-open' && (
        <path
          d={`M ${x - 8} ${y} C ${x - 4} ${y - 4}, ${x - 2} ${y + 4}, ${x + 2} ${y} S ${x + 6} ${y + 3}, ${x + 8} ${y - 1}`}
          fill="none"
          stroke={line}
          strokeWidth="2"
        />
      )}
      {kind === 'led-strip-closed' && (
        <>
          <circle cx={x} cy={y} r="6.5" fill="none" stroke={line} strokeWidth="2" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
            const radians = (angle * Math.PI) / 180
            return <circle key={angle} cx={x + 6.5 * Math.cos(radians)} cy={y + 6.5 * Math.sin(radians)} r="0.7" fill={line} />
          })}
        </>
      )}
      {smallBar && (
        <rect x={x - 7} y={y - 3.5} width="14" height="7" rx="1" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      )}
    </>
  )
}
