// LightKey's cue-button shortcut menu — in TWO forms (Jake, 27 Nov
// 2026, resolved from his screenshots vs Video 1 + the guide):
// - Live mode (Jake's screenshots, 3.30–3.31pm): Get Info, Show
//   Properties, Edit Ad Hoc Properties, Add Overrides, Rename,
//   Control Type >, Behavior >, Priority >, Color >, Modifiers >,
//   External Control >. No Cut, Copy, Paste, Duplicate, Delete,
//   Font, Alignment or Remove From Frame — those are edit operations,
//   and the guide's ch.11 edit section (p.180) says "The remainder of
//   this section assumes that the Live view is in edit mode".
// - Edit mode (Video 1, verbatim order): the same items plus Cut,
//   Copy, Paste (after Add Overrides), Duplicate, Delete (after
//   Rename), Font >, Alignment > and Remove From Frame. Delete
//   survives here — it is the "kaboooom" UI for deleting a cue button
//   from the canvas (the rule from the cuelist-as-widget commit); it
//   must never be removed from every mode.
// Separator grouping (Jake, 27 Nov 2026, screenshots 8.45.41pm +
// 8.46.06pm): LightKey's Live menu groups [Get Info] | [Show
// Properties, Edit Ad Hoc Properties, Add Overrides] | [Rename] |
// [Control Type, Behavior, Priority, Color, Modifiers] | [External
// Control]. Edit mode is INFERRED from LightKey's own cuelist widget
// menu in Jake's 5.20.33pm screenshot, which separates the clipboard
// operations from the object operations — [Cut, Copy, Paste] |
// [Rename, Duplicate, Delete] — so the button menu does the same, with
// Font / Alignment / Remove From Frame staying in the settings group.
// No direct photograph of LightKey's Edit-mode button menu exists in
// our evidence; if Jake's shows different separators there, they move.
// "Show Properties" carries LightKey's speech-bubble icon (rounded
// rectangle with a small tail at the top, measured from 8.45.41pm and
// confirmed at full resolution in 5.20.33pm — the same glyph appears in
// both menus). The cuelist widget menu still lacks the icon and the
// separator after Paste (noted, out of scope for this change).
// Go / Stop / Live view are NOT here — they live in the cue-list
// transport (Part 1) and on Space. Used by both the Live-mode global
// menu (ContextMenu, kind 'cue') and the edit-mode canvas menu
// (LiveWorkspace, right-click on a button); the mode comes from the
// store's liveEditing flag. The caller owns positioning and
// dismissal; this component is only the item list. Submenus fly out
// sideways as a separate panel to the right of the parent item (Jake,
// 27 Nov 2026, LightKey screenshots — the old inline expansion grew
// the menu until it ran off the bottom of the screen); they flip to
// the left when there is no room on the right, and shift up when they
// would run off the bottom. Items that cannot act are disabled with
// the reason as their tooltip (Jake, 27 Nov 2026 — no silent no-ops).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useShowStore, collectInlineCues } from '../stores/showStore'
import { frameForCue } from '../lib/liveFrames'
import { isClipboardEmpty } from '../lib/livePageObjects'
import { DEFAULT_BUTTON_APPEARANCE_COLOR, LIGHTKEY_BUTTON_COLORS, contrastingTextColor } from '../lib/liveButtonColor'
import { controlBehavior, isFaderControl } from '../lib/liveControlBehavior'
import { DEFAULT_CUE_PRIORITY } from '../lib/cuePriority'
import { LIGHTKEY_MODIFIERS, applicableModifiers } from '../lib/liveModifiers'
import { DEFAULT_OBJECT_STYLES } from '@shared/liveObjectDefaults'
import { flyoutSide, flyoutTopShift } from '../lib/menuPosition'
import type { LiveControl } from '@shared/types'

type SubmenuItem = { key: string; label: string; checked?: boolean; disabledReason?: string | null; color?: string; action?: () => void } | { key: string; separator: true }
type MenuItem = {
  key: string
  label: string
  icon?: ReactNode
  disabledReason?: string | null
  submenu?: SubmenuItem[]
  action?: () => void
}
type MenuEntry = MenuItem | { key: string; separator: true }

// A separator entry. (A `{ separator: true }` literal inside a spread
// ternary widens `true` to `boolean` and fails the MenuEntry check;
// the helper keeps the literal type.)
const sep = (key: string): MenuEntry => ({ key, separator: true })

// LightKey's "Show Properties" glyph: a speech bubble — a rounded
// rectangle with a small tail rising from the top edge, left of
// centre (measured from Jake's 8.45.41pm screenshot, confirmed at
// full resolution in 5.20.33pm). Drawn with the menu text colour.
function ShowPropertiesIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M9 6.5 7.2 2.5 12 6.5" />
      <rect x="2.5" y="6.5" width="19" height="13.5" rx="3.5" />
    </svg>
  )
}

export function CueButtonMenu({ controlId, onClose }: { controlId: string; onClose: () => void }) {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  // Fly-out placement (measured after the submenu mounts, the same
  // measure-then-clamp pattern as useClampedMenuPosition): the submenu
  // first renders on the right of its parent item, then flips left and
  // shifts up when it would run off the viewport. Reset on every open
  // so a submenu never inherits the previous item's flip.
  const submenuRef = useRef<HTMLDivElement | null>(null)
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right')
  const [submenuTopShift, setSubmenuTopShift] = useState(0)
  useLayoutEffect(() => {
    const el = submenuRef.current
    const itemEl = el?.parentElement
    if (!openSubmenu || !el || !itemEl) return
    const rect = el.getBoundingClientRect()
    const itemRect = itemEl.getBoundingClientRect()
    setSubmenuSide(flyoutSide(itemRect.left, itemRect.right, rect.width))
    setSubmenuTopShift(flyoutTopShift(rect.top, rect.bottom))
  }, [openSubmenu])
  const openSubmenuFor = (key: string | null) => {
    setOpenSubmenu(key)
    setSubmenuSide('right')
    setSubmenuTopShift(0)
  }
  // Escape closes the submenu first, then the menu — and stops here, so
  // the app-level Escape handler (which stops the cue) does not also
  // fire while the menu is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      if (openSubmenu) openSubmenuFor(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [openSubmenu, onClose])
  const control = useShowStore((s) => s.show?.livePages?.flatMap((p) => p.controls).find((c) => c.id === controlId))
  const page = useShowStore((s) => {
    const id = s.activeLivePageId
    return s.show?.livePages?.find((p) => p.id === id) ?? s.show?.livePages?.[0]
  })
  const manualOverrides = useShowStore((s) => s.manualOverrides)
  const pageClipboard = useShowStore((s) => s.pageClipboard)
  // Live mode shows LightKey's short menu, Edit mode the full one.
  const editing = useShowStore((s) => s.liveEditing)
  // Inline cues (Jake, 27 Nov 2026): there is no project-wide cue
  // list — `cues` is the collected view over the buttons' and steps'
  // inline cues, for the call sites that still take a cue list.
  const show = useShowStore((s) => s.show)
  const cueLists = useShowStore((s) => s.cueLists)
  const cues = collectInlineCues(show, cueLists)
  const presets = useShowStore((s) => s.presets)
  const fixtures = useShowStore((s) => s.show?.fixtures ?? [])
  const sequences = useShowStore((s) => s.show?.sequences ?? [])
  const effects = useShowStore((s) => s.effects)
  const midiMappings = useShowStore((s) => s.midiMappings ?? [])
  if (!control || !page) return null

  const state = useShowStore.getState()
  const run = (fn: () => void) => { fn(); onClose() }
  const openInfo = (tab: 'contents' | 'options' | 'button') =>
    window.dispatchEvent(new CustomEvent('openlights-open-cue-info', { detail: { controlId, tab } }))
  const isAutomaticColour = !control.appearance?.color || control.appearance.color.toLowerCase() === DEFAULT_BUTTON_APPEARANCE_COLOR
  const align = { ...DEFAULT_OBJECT_STYLES.cue, ...control.style }.align ?? 'center'
  const inFrame = frameForCue(page, controlId) !== null
  const priority = control.priority ?? DEFAULT_CUE_PRIORITY
  const selectedModifiers = control.selectedModifiers ?? []
  // applicableModifiers still reads the button's own preset / sequence
  // / ad-hoc lists (liveModifiers.ts, Agent 4's file — not migrated to
  // control.cue yet), so a button carrying an inline cue is passed
  // with the cue's contents mirrored onto those lists: the checklist
  // then reflects the cue the button actually holds, not the stale
  // lists the button had before the cue was picked.
  const modifierControl: LiveControl = control.cue
    ? { ...control, presetIds: control.cue.presetIds ?? [], sequenceIds: control.cue.sequenceIds ?? [], adHocValues: control.cue.fixtureValues ?? {} }
    : control
  const applies = applicableModifiers(modifierControl, cues, presets, fixtures, sequences, effects)
  // The button's MIDI trigger, if it has one (LightKey's External
  // Control > Replace / Remove Trigger are greyed without one).
  const trigger = midiMappings.find((m) => m.targetType === 'live-cue' && m.targetId === controlId)
  const learnTrigger = () =>
    window.dispatchEvent(new CustomEvent('openlights-learn-midi', { detail: { targetId: controlId, label: control.name } }))

  const items: MenuEntry[] = [
    { key: 'getInfo', label: 'Get Info', action: () => openInfo('contents') },
    // LightKey groups Get Info alone (8.45.41pm) — the separator sits
    // after it, not after Show Properties.
    { key: 'sepAfterGetInfo', separator: true },
    // Show Properties opens the same inspector as Get Info — the guide
    // uses "Get Info" for Live objects and "Show Properties" for Design
    // objects, and no source shows a second panel for a button.
    { key: 'showProperties', label: 'Show Properties', icon: <ShowPropertiesIcon />, action: () => openInfo('contents') },
    {
      key: 'editAdHocProperties', label: 'Edit Ad Hoc Properties',
      action: () => {
        if (control.cue) state.startEditingCueAdHoc(control.cue.id)
        else window.dispatchEvent(new Event('openlights-open-live-properties'))
      },
    },
    {
      key: 'addOverrides', label: 'Add Overrides',
      disabledReason: Object.keys(manualOverrides).length ? null : 'No overridden properties to add',
      action: () => state.addOverridesToCues([controlId], false),
    },
    { key: 'sepAfterAddOverrides', separator: true },
    // Cut / Copy / Paste are edit operations (guide ch.11 edit section,
    // p.180) — Live mode has no clipboard group. In Edit mode they are
    // their own group, separated from Rename / Duplicate / Delete
    // (LightKey's cuelist menu, Jake's 5.20.33pm screenshot).
    ...(editing ? [
      { key: 'cut', label: 'Cut', action: () => { state.copySelectedPageObjects(); state.deleteSelectedPageObjects() } },
      { key: 'copy', label: 'Copy', action: () => state.copySelectedPageObjects() },
      {
        key: 'paste', label: 'Paste',
        disabledReason: isClipboardEmpty(pageClipboard) ? 'Nothing to paste' : null,
        action: () => state.pastePageObjects(),
      },
      sep('sepAfterClipboard'),
    ] as MenuEntry[] : []),
    { key: 'rename', label: 'Rename', action: () => window.dispatchEvent(new CustomEvent('openlights-rename-live-control', { detail: { controlId } })) },
    // Duplicate / Delete are edit operations too — Delete is the
    // "kaboooom" UI, and it lives here, in Edit mode. In Live mode
    // Rename stands alone in its group, so the separator follows it.
    ...(editing ? [
      { key: 'duplicate', label: 'Duplicate', action: () => state.duplicateSelectedPageObjects() },
      { key: 'delete', label: 'Delete', action: () => state.deleteSelectedPageObjects() },
      sep('sepAfterDelete'),
    ] as MenuEntry[] : [
      sep('sepAfterRename'),
    ]),
    {
      key: 'controlType', label: 'Control Type',
      // Guide p.179 + p.204: Push Button, Fader Horizontal, Fader
      // Vertical. There is no "Toggle Button" type — that is a Push
      // Button with Toggle behaviour (see Behavior below).
      submenu: (['push', 'faderHorizontal', 'faderVertical'] as LiveControl['type'][]).map((type) => ({
        key: type,
        label: type === 'push' ? 'Push Button' : type === 'faderHorizontal' ? 'Fader Horizontal' : 'Fader Vertical',
        checked: control.type === type,
        action: () => state.configureControlType(controlId, type),
      })),
    },
    {
      key: 'behavior', label: 'Behavior',
      // Behavior is a push-button setting (guide p.204); a fader has
      // no behavior. Toggle latches, Flash is momentary.
      disabledReason: isFaderControl(control) ? 'Faders have no behavior' : null,
      submenu: (['toggle', 'flash'] as const).map((behavior) => ({
        key: behavior,
        label: behavior === 'toggle' ? 'Toggle' : 'Flash',
        checked: controlBehavior(control) === behavior,
        action: () => state.configureControlBehavior(controlId, behavior),
      })),
    },
    {
      key: 'priority', label: 'Priority',
      // Guide p.204 + p.223: the cue's priority when several cues
      // define the same properties — higher wins, ties go to the most
      // recently activated. Default 5 — Normal (Jake's screenshot).
      submenu: [9, 8, 7, 6, 5, 4, 3, 2, 1].map((value) => ({
        key: `priority-${value}`,
        label: value === 9 ? '9 — Highest' : value === 5 ? '5 — Normal' : value === 1 ? '1 — Lowest' : String(value),
        checked: priority === value,
        action: () => state.configureCuePriority(controlId, value),
      })),
    },
    {
      key: 'color', label: 'Color',
      // Guide p.204: Automatic finds a colour from the cue's contents;
      // otherwise the button takes the picked swatch (Jake's screenshot
      // — the twelve bars, hexes measured from it). No Custom… here:
      // LightKey's submenu has none; a custom colour is picked in the
      // inspector's Button tab.
      submenu: [
        { key: 'automatic', label: 'Automatic', checked: isAutomaticColour, action: () => state.configureCueAppearance(controlId, { color: DEFAULT_BUTTON_APPEARANCE_COLOR }) },
        { key: 'colorSep', separator: true },
        ...LIGHTKEY_BUTTON_COLORS.map((swatch) => ({
          key: `color-${swatch.hex}`,
          label: swatch.name,
          color: swatch.hex,
          checked: control.appearance?.color?.toLowerCase() === swatch.hex,
          action: () => state.configureCueAppearance(controlId, { color: swatch.hex }),
        })),
      ],
    },
    {
      key: 'modifiers', label: 'Modifiers',
      // Guide pp.205–207: selecting a modifier marks it to be
      // controlled in the Live view. Only the modifiers that apply to
      // this cue are enabled; the rest are greyed. The value control
      // and output application are not built yet (open question).
      submenu: LIGHTKEY_MODIFIERS.map((modifier) => ({
        key: modifier.key,
        label: modifier.label,
        checked: selectedModifiers.includes(modifier.key),
        disabledReason: applies.has(modifier.key) ? null : 'Does not apply to this cue',
        action: () => state.toggleCueModifier(controlId, modifier.key),
      })),
    },
    // Font / Alignment / Remove From Frame are edit operations (Video
    // 1). Font's contents are unproven — it stays disabled, pointing
    // at the inspector, as before.
    ...(editing ? [
      { key: 'font', label: 'Font', disabledReason: 'Change the font in the inspector' },
      {
        key: 'alignment', label: 'Alignment',
        // Video 1 shows Alignment greyed for the button on camera; the
        // guide (p.204) proves the field ("Change the alignment of the
        // button's title"), so it is live here — Left / Center / Right,
        // matching the inspector's align control.
        submenu: (['left', 'center', 'right'] as const).map((value) => ({
          key: value,
          label: value === 'left' ? 'Left' : value === 'center' ? 'Center' : 'Right',
          checked: align === value,
          action: () => state.setPageObjectStyle({ type: 'cue', id: controlId }, { align: value }),
        })),
      },
      {
        key: 'removeFromFrame', label: 'Remove From Frame',
        disabledReason: inFrame ? null : 'Not in a frame',
        action: () => state.removeFromFrame(controlId),
      },
    ] as MenuEntry[] : []),
    // Font / Alignment / Remove From Frame stay in the settings group
    // with Control Type … Modifiers (all button settings); the
    // separator before External Control follows them in Edit mode and
    // Modifiers in Live mode, as in LightKey's Live menu (8.45.41pm).
    { key: 'sepBeforeExternal', separator: true },
    {
      key: 'externalControl', label: 'External Control',
      submenu: [
        {
          key: 'addTrigger', label: 'Add Trigger…',
          // A button has one trigger in LightKey's model; with one
          // already bound, Replace is the way to change it. (Inference
          // — Jake's screenshot shows only the no-trigger case.)
          disabledReason: trigger ? 'This button already has a trigger — use Replace Trigger…' : null,
          action: () => run(learnTrigger),
        },
        {
          key: 'replaceTrigger', label: 'Replace Trigger…',
          disabledReason: trigger ? null : 'No trigger to replace',
          action: () => run(learnTrigger),
        },
        {
          key: 'removeTrigger', label: 'Remove Trigger',
          disabledReason: trigger ? null : 'No trigger to remove',
          action: () => {
            for (const m of midiMappings.filter((item) => item.targetType === 'live-cue' && item.targetId === controlId)) state.removeMidiMapping(m.id)
            onClose()
          },
        },
        { key: 'externalSep1', separator: true },
        // Copy OSC Address: the app has no OSC server (USB-only DMX
        // scope), so there is no live address to copy — disabled
        // rather than copying a dead one.
        { key: 'copyOsc', label: 'Copy OSC Address', disabledReason: 'OSC is not available in this app' },
        { key: 'externalSep2', separator: true },
        // Add Shortcut…: the app has no per-button keyboard shortcut
        // bindings yet, so there is nothing to add it to.
        { key: 'addShortcut', label: 'Add Shortcut…', disabledReason: 'Keyboard shortcuts for buttons are not built yet' },
      ],
    },
  ]

  return <>
    {items.map((item) => {
      if ('separator' in item) return <div key={item.key} role="separator" className="mx-2 my-1 border-t border-line" />
      const disabled = item.disabledReason != null
      const expanded = openSubmenu === item.key
      return <div key={item.key} className="relative"
        // LightKey opens submenus on hover; a click toggles (touch).
        // Hovering a plain item closes any open submenu, and leaving
        // the item row closes it too — the submenu is a child of this
        // wrapper, so moving from the row into the submenu never leaves
        // it, and the submenu stays open while the pointer is in it.
        onPointerEnter={() => { if (!disabled) openSubmenuFor(item.submenu ? item.key : null) }}
        onPointerLeave={() => { if (expanded) openSubmenuFor(null) }}>
        <button type="button" role="menuitem" disabled={disabled} title={item.disabledReason ?? undefined} aria-haspopup={item.submenu ? 'menu' : undefined} aria-expanded={item.submenu ? expanded : undefined} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => {
          if (item.submenu) { openSubmenuFor(expanded ? null : item.key); return }
          if (item.action) run(item.action)
        }}>{item.icon && <span className="mr-2 inline-flex align-middle [&_svg]:h-3.5 [&_svg]:w-3.5">{item.icon}</span>}{item.label}{item.submenu && <span className="float-right ml-4 text-dim">›</span>}</button>
        {item.submenu && expanded && <div ref={submenuRef} role="menu" aria-label={`${item.label} options`} data-flyout-side={submenuSide} className="absolute z-[310] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={submenuSide === 'right' ? { left: 'calc(100% - 2px)', top: -5 + submenuTopShift } : { right: 'calc(100% - 2px)', top: -5 + submenuTopShift }}>
          {item.submenu.map((sub) => {
            if ('separator' in sub) return <div key={sub.key} role="separator" className="mx-2 my-1 border-t border-line" />
            const subDisabled = sub.disabledReason != null
            return <button key={sub.key} type="button" role="menuitemradio" aria-checked={sub.checked === true} aria-label={sub.color ? `${sub.label} button colour` : undefined} disabled={subDisabled} title={sub.disabledReason ?? undefined} className="block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { if (sub.action) run(sub.action) }}>
              {sub.color
                // LightKey's colour swatches are wide colour bars, not
                // text rows — the bar is the swatch, with a tick when
                // it is the button's colour.
                ? <span className="relative block h-5 w-full rounded-sm border border-line" style={{ backgroundColor: sub.color }} title={sub.label}>{sub.checked && <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: contrastingTextColor(sub.color) }}>✓</span>}</span>
                : <>{sub.checked ? '✓ ' : ''}{sub.label}</>}
            </button>
          })}
        </div>}
      </div>
    })}
  </>
}
