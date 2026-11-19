import { useState } from 'react'

// Per-property fanning affordance (LightKey Guide §8, p.118–119, p.122–
// 123): fanning is added from a fixture property's own control in the
// Design view — "Click the fixture property's name in the Design view …
// then choose Add (property name) Fanning… from the menu" — and when a
// property is fanned, "its area in the Design view shows an icon instead
// of the normal controls", which reopens the Fanning HUD when clicked.
// The blue dot to the left of the property's name deletes the fanning
// (Guide p.123).

export function dispatchFanHud(detail: { attribute: string; alsoAttribute?: string }) {
  window.dispatchEvent(new CustomEvent('openlights-open-fan-hud', { detail }))
}

// The spreading-fan glyph: three lines fanning out from a common point.
export function FanGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 14 L8 4 M8 14 L3.5 6.5 M8 14 L12.5 6.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M3.5 6.5 A 6.8 6.8 0 0 1 12.5 6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

export function FanMenuButton({ label, items, disabled = false, title }: {
  /** The property's label, e.g. "Dimmer" — the menu offers "Add Dimmer Fanning…". */
  label: string
  items: { label: string; onSelect: () => void }[]
  disabled?: boolean
  /** Menu button label; defaults to `Add ${label} fanning`. The Colour
      menu also offers the LightKey default-value actions (Guide p.114),
      so it uses "Colour options". */
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const buttonTitle = title ?? `Add ${label} fanning`
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        title={buttonTitle}
        aria-label={buttonTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="rounded p-0.5 text-dim hover:bg-panel2 hover:text-white disabled:opacity-40"
      >
        <FanGlyph />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} onPointerDown={() => setOpen(false)} />
          <span role="menu" className="absolute left-0 top-full z-40 mt-1 min-w-44 rounded border border-line bg-panel p-1 shadow-xl">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); item.onSelect() }}
                className="block w-full rounded px-2 py-1 text-left text-xs text-text hover:bg-panel2"
              >
                {item.label}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  )
}

// The icon that replaces a fanned property's normal controls (Guide
// p.122). Clicking it reopens the Fanning HUD for that property. The
// "Fanned" caption is an OpenLights clarity addition — LightKey shows
// the icon alone — so the state is recognisable without hovering.
export function FannedIcon({ label, onEdit }: { label: string; onEdit: () => void }) {
  return (
    <button
      type="button"
      title={`${label} is fanned — click to edit the fanning`}
      aria-label={`${label} is fanned — click to edit the fanning`}
      onClick={onEdit}
      className="flex flex-1 flex-col items-center justify-center gap-1 rounded border border-line bg-panel2 px-2 py-3 text-text hover:text-white"
    >
      <FanGlyph size={22} />
      <span className="text-[10px] font-medium uppercase tracking-wide">Fanned</span>
    </button>
  )
}

// LightKey's blue dot (Guide p.121–123): marks a defined/fanned value.
// In the Design view, clicking the dot to the left of a fanned
// property's name deletes the fanning — keeping the fanned values,
// the non-destructive choice (the HUD's "Delete Fanning and Keep
// Values", Guide p.122).
export function FanDeleteDot({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <button
      type="button"
      title={`Delete ${label} fanning (keep the fanned values)`}
      aria-label={`Delete ${label} fanning (keep the fanned values)`}
      onClick={onDelete}
      className="text-sm leading-none text-blue-400 hover:text-blue-300"
    >
      ●
    </button>
  )
}
