// LightKey's cuelist-widget shortcut menu (Jake, 27 Nov 2026 —
// screenshot 5.20.33, right-click ON the cuelist widget in Live mode):
// Get Info, Activate, Activate With Fade, Show Properties, Edit Ad Hoc
// Properties, Add Overrides, Cut, Copy, Paste, Rename, Renumber,
// Duplicate, Delete, Modifiers ›, External Control ›, New Cue, New
// Group, New Group From Selection. Unlike the button menu, the
// clipboard group and Delete ARE here in Live mode — the screenshot
// proves it. The caller owns positioning and dismissal; this component
// is only the item list. Submenus fly out sideways, the same pattern
// as CueButtonMenu. Items that cannot act are disabled with the reason
// as their tooltip (no silent no-ops).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useShowStore, collectInlineCues } from '../stores/showStore'
import { isClipboardEmpty } from '../lib/livePageObjects'
import { LIGHTKEY_MODIFIERS, applicableModifiers } from '../lib/liveModifiers'
import { flyoutSide, flyoutTopShift } from '../lib/menuPosition'
import type { LiveControl } from '@shared/types'

type SubmenuItem = { key: string; label: string; checked?: boolean; disabledReason?: string | null; action?: () => void } | { key: string; separator: true }
type MenuItem = {
  key: string
  label: string
  disabledReason?: string | null
  submenu?: SubmenuItem[]
  action?: () => void
  actionWithEvent?: (event: React.MouseEvent) => void
}
type MenuEntry = MenuItem | { key: string; separator: true }

export function CueListWidgetMenu({ widgetId, listId, stepId, selectedStepIds, onClose }: {
  widgetId: string
  listId: string
  stepId: string | null
  selectedStepIds: string[]
  onClose: () => void
}) {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
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
  // the app-level Escape handler does not also fire while it is open.
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

  const list = useShowStore((s) => s.cueLists.find((l) => l.id === listId))
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
  const manualOverrides = useShowStore((s) => s.manualOverrides)
  const pageClipboard = useShowStore((s) => s.pageClipboard)
  const activeCueListId = useShowStore((s) => s.activeCueListId)
  const activeCueIndex = useShowStore((s) => s.activeCueIndex)
  if (!list) return null

  const state = useShowStore.getState()
  const run = (fn: () => void) => { fn(); onClose() }
  // The step this menu acts on: the right-clicked step, else the first
  // selected step, else the playing step, else the first step. Get Info
  // on the widget with no step opens the cuelist inspector instead.
  const anchorStepId = stepId ?? selectedStepIds[0] ?? (activeCueListId === list.id && activeCueIndex >= 0 ? list.steps[activeCueIndex]?.id : undefined) ?? list.steps[0]?.id
  const anchorStep = list.steps.find((s) => s.id === anchorStepId)
  const anchorIndex = anchorStep ? list.steps.indexOf(anchorStep) : -1
  const anchorCue = anchorStep?.cue
  // Duplicate acts on the right-clicked step, else the selected steps
  // (a right-click on a step selects just that step first, so the two
  // agree there; a right-click on blank canvas keeps a multi-step
  // selection, which duplicates each step in place, in list order).
  const duplicateTargets = stepId ? [stepId] : selectedStepIds
  const openStepInfo = (targetStepId: string) =>
    window.dispatchEvent(new CustomEvent('openlights-open-step-info', { detail: { listId, stepId: targetStepId } }))
  const openListInfo = () =>
    window.dispatchEvent(new CustomEvent('openlights-open-list-info', { detail: { widgetId } }))

  // The Modifiers submenu acts on the anchor step's cue. applicableModifiers
  // reads a button-like control, so the step is presented as one: the
  // step's cue itself, with its contents mirrored onto the control's
  // own lists (liveModifiers.ts still reads those lists, not
  // control.cue — see CueButtonMenu).
  const syntheticControl: LiveControl | null = anchorCue && anchorStep
    ? { id: anchorStep.id, name: anchorCue.name, type: 'push', x: 0, y: 0, cue: anchorCue, presetIds: anchorCue.presetIds ?? [], sequenceIds: anchorCue.sequenceIds ?? [], adHocValues: anchorCue.fixtureValues ?? {} }
    : null
  const applies = syntheticControl ? applicableModifiers(syntheticControl, cues, presets, fixtures, sequences, effects) : new Set<string>()
  const selectedModifiers = anchorStep?.selectedModifiers ?? []

  const items: MenuEntry[] = [
    {
      key: 'getInfo', label: 'Get Info',
      action: () => {
        if (stepId || anchorStep) openStepInfo(anchorStep?.id ?? list.steps[0].id)
        else openListInfo()
      },
    },
    {
      key: 'activate', label: 'Activate',
      // Guide ch.11, p.219: Activate jumps to the cue instantly — fade 0.
      disabledReason: !anchorStep ? 'No cues in this list' : null,
      action: () => { if (anchorStep && anchorIndex >= 0) state.goToCue(list.id, anchorIndex, 0) },
    },
    {
      key: 'activateWithFade', label: 'Activate With Fade',
      // Guide ch.11, p.219: "fades to the cue according to the previous
      // cue's fade time" — the step before the target, else the target's
      // own fade when it is the first step.
      disabledReason: !anchorStep ? 'No cues in this list' : null,
      action: () => {
        if (!anchorStep || anchorIndex < 0) return
        const previous = list.steps[anchorIndex - 1]
        state.goToCue(list.id, anchorIndex, previous?.fadeMs ?? anchorStep.fadeMs)
      },
    },
    // Show Properties opens the same inspector as Get Info — the guide
    // uses Get Info for Live objects and Show Properties for Design
    // objects, and no source shows a second panel for a cuelist.
    {
      key: 'showProperties', label: 'Show Properties',
      action: () => {
        if (stepId || anchorStep) openStepInfo(anchorStep?.id ?? list.steps[0].id)
        else openListInfo()
      },
    },
    { key: 'sep1', separator: true },
    {
      key: 'editAdHocProperties', label: 'Edit Ad Hoc Properties',
      disabledReason: !anchorCue ? 'No cue to edit' : null,
      action: () => { if (anchorCue) state.startEditingCueAdHoc(anchorCue.id) },
    },
    {
      key: 'addOverrides', label: 'Add Overrides',
      disabledReason: Object.keys(manualOverrides).length ? null : 'No overridden properties to add',
      // With a step anchored, the overrides merge into that cue only;
      // otherwise into every cue in the list (Guide ch.11, p.202).
      action: () => state.addOverridesToCues(anchorCue ? [anchorCue.id] : list.steps.map((s) => s.cue.id), false),
    },
    { key: 'sep2', separator: true },
    // Cut / Copy / Paste / Delete are in the cuelist menu even in Live
    // mode (Jake's screenshot 5.20.33) — unlike the button menu, where
    // they are edit operations. The selection is the widget (the
    // right-click handler selects it before opening this menu), so
    // Cut / Delete act on the widget — and, through the store's
    // widget-scoped lifecycle, on its list when nothing else shows it.
    { key: 'cut', label: 'Cut', action: () => { state.copySelectedPageObjects(); state.deleteSelectedPageObjects() } },
    { key: 'copy', label: 'Copy', action: () => state.copySelectedPageObjects() },
    {
      key: 'paste', label: 'Paste',
      disabledReason: isClipboardEmpty(pageClipboard) ? 'Nothing to paste' : null,
      action: () => state.pastePageObjects(),
    },
    {
      key: 'rename', label: 'Rename',
      // With a step anchored, the step's cue is renamed; otherwise the
      // cuelist itself. Both open the same inline name input the button
      // Rename flow uses.
      action: () => {
        if (anchorStep) window.dispatchEvent(new CustomEvent('openlights-rename-cue-step', { detail: { listId, stepId: anchorStep.id } }))
        else window.dispatchEvent(new CustomEvent('openlights-rename-cuelist', { detail: { widgetId } }))
      },
    },
    {
      key: 'renumber', label: 'Renumber',
      // Guide ch.11, p.195: re-number the selected steps (or all steps
      // when none are selected) in list order, starting from the first
      // step's leading number.
      disabledReason: list.steps.length ? null : 'No cues to renumber',
      action: () => state.renumberCueList(list.id, selectedStepIds.length ? selectedStepIds : undefined),
    },
    // Duplicate (Guide ch.11, p.189 — "When you add a new cue or
    // duplicate a cue, Lightkey automatically increments the new cue's
    // number"): the menu's Duplicate acts on the selected cue step(s)
    // inside the list — Jake's screenshot 5.20.33 shows it enabled,
    // and 7.10.50 shows the result (001 / 002 / 003 New Cue). The
    // guide's one-cuelist-per-page rule (p.190 — "A page can't contain
    // more than one cuelist") forbids duplicating the LIST itself, so
    // there is no list-duplicate path; duplicating the whole list
    // stays impossible.
    {
      key: 'duplicate', label: 'Duplicate',
      disabledReason: duplicateTargets.length ? null : 'No cue selected to duplicate',
      action: () => state.duplicateCueSteps(list.id, duplicateTargets),
    },
    { key: 'delete', label: 'Delete', action: () => state.deleteSelectedPageObjects() },
    { key: 'sep3', separator: true },
    {
      key: 'modifiers', label: 'Modifiers',
      // Guide pp.205–207: selecting a modifier marks it to be
      // controlled in the Live view. Only the modifiers that apply to
      // the anchor cue are enabled; the rest are greyed. The value
      // control and output application are not built yet (open question).
      disabledReason: anchorStep ? null : 'No cue to modify',
      submenu: LIGHTKEY_MODIFIERS.map((modifier) => ({
        key: modifier.key,
        label: modifier.label,
        checked: selectedModifiers.includes(modifier.key),
        disabledReason: applies.has(modifier.key) ? null : 'Does not apply to this cue',
        action: () => {
          if (!anchorStep) return
          const next = selectedModifiers.includes(modifier.key)
            ? selectedModifiers.filter((k) => k !== modifier.key)
            : [...selectedModifiers, modifier.key]
          state.updateCueStep(list.id, anchorStep.id, { selectedModifiers: next })
        },
      })),
    },
    {
      key: 'externalControl', label: 'External Control',
      submenu: [
        // The app's MIDI learn flow only knows live-cue targets (App.tsx:
        // midiLearnTarget is typed 'live-cue'); there is no cuelist
        // trigger target yet, so triggers for a cuelist cannot be bound
        // — the submenu keeps LightKey's shape with honest reasons.
        { key: 'addTrigger', label: 'Add Trigger…', disabledReason: 'Triggers for cuelists are not built yet' },
        { key: 'replaceTrigger', label: 'Replace Trigger…', disabledReason: 'No trigger to replace' },
        { key: 'removeTrigger', label: 'Remove Trigger', disabledReason: 'No trigger to remove' },
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
    { key: 'sep4', separator: true },
    {
      key: 'newCue', label: 'New Cue',
      // Guide ch.11, p.191: New Cue inserts below the clicked item;
      // Shift-click inserts above it. The new cue's inspector appears
      // beside the cuelist.
      actionWithEvent: (event) => {
        const anchor = stepId ?? selectedStepIds[selectedStepIds.length - 1]
        const anchorIndex = anchor ? list.steps.findIndex((s) => s.id === anchor) : -1
        const at = anchorIndex >= 0 ? (event.shiftKey ? anchorIndex : anchorIndex + 1) : undefined
        const cueId = state.addCueToListAt(list.id, at)
        const step = useShowStore.getState().cueLists.find((l) => l.id === list.id)?.steps.find((s) => s.cue.id === cueId)
        if (step) openStepInfo(step.id)
        onClose()
      },
    },
    {
      key: 'newGroup', label: 'New Group',
      // Guide ch.11, p.192: a group is inserted below the selection (or
      // at the end) and named, then Return commits the name — the group
      // appears with its name input open.
      action: () => {
        const anchor = stepId ?? selectedStepIds[selectedStepIds.length - 1] ?? (activeCueListId === list.id && activeCueIndex >= 0 ? list.steps[activeCueIndex]?.id : undefined)
        const groupId = state.addCueListGroup(list.id, 'New Group', anchor ?? undefined)
        window.dispatchEvent(new CustomEvent('openlights-rename-cue-group', { detail: { listId, groupId } }))
      },
    },
    {
      key: 'newGroupFromSelection', label: 'New Group From Selection',
      // Guide ch.11, p.192: wraps the selected cues in a new group.
      disabledReason: selectedStepIds.length ? null : 'Select cues to group first',
      action: () => {
        const groupId = state.addCueListGroupFromSelection(list.id, selectedStepIds, 'New Group')
        window.dispatchEvent(new CustomEvent('openlights-rename-cue-group', { detail: { listId, groupId } }))
      },
    },
  ]

  return <>
    {items.map((item) => {
      if ('separator' in item) return <div key={item.key} role="separator" className="mx-2 my-1 border-t border-line" />
      const disabled = item.disabledReason != null
      const expanded = openSubmenu === item.key
      return <div key={item.key} className="relative"
        onPointerEnter={() => { if (!disabled) openSubmenuFor(item.submenu ? item.key : null) }}
        onPointerLeave={() => { if (expanded) openSubmenuFor(null) }}>
        <button type="button" role="menuitem" disabled={disabled} title={item.disabledReason ?? undefined} aria-haspopup={item.submenu ? 'menu' : undefined} aria-expanded={item.submenu ? expanded : undefined} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={(event) => {
          if (item.submenu) { openSubmenuFor(expanded ? null : item.key); return }
          if (item.actionWithEvent) { item.actionWithEvent(event); return }
          if (item.action) run(item.action)
        }}>{item.label}{item.submenu && <span className="float-right ml-4 text-dim">›</span>}</button>
        {item.submenu && expanded && <div ref={submenuRef} role="menu" aria-label={`${item.label} options`} data-flyout-side={submenuSide} className="absolute z-[310] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={submenuSide === 'right' ? { left: 'calc(100% - 2px)', top: -5 + submenuTopShift } : { right: 'calc(100% - 2px)', top: -5 + submenuTopShift }}>
          {item.submenu.map((sub) => {
            if ('separator' in sub) return <div key={sub.key} role="separator" className="mx-2 my-1 border-t border-line" />
            const subDisabled = sub.disabledReason != null
            return <button key={sub.key} type="button" role="menuitemradio" aria-checked={sub.checked === true} disabled={subDisabled} title={sub.disabledReason ?? undefined} className="block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { if (sub.action) run(sub.action) }}>
              {sub.checked ? '✓ ' : ''}{sub.label}
            </button>
          })}
        </div>}
      </div>
    })}
  </>
}
