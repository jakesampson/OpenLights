// LightKey's cue-button shortcut menu (Video 1, verbatim order):
// Get Info, Show Properties, Edit Ad Hoc Properties, Add Overrides,
// Cut, Copy, Paste, Rename, Duplicate, Delete, Control Type >,
// Behavior >, Priority >, Color >, Modifiers >, Font >, Alignment >,
// Remove From Frame, External Control >. Go / Stop / Live view are
// NOT here — they live in the cue-list transport (Part 1) and on
// Space. Used by both the Live-mode global menu (ContextMenu, kind
// 'cue') and the edit-mode canvas menu (LiveWorkspace, right-click on
// a button). The caller owns positioning and dismissal; this component
// is only the item list. Submenus expand inline below their parent.
// Items that cannot act are disabled with the reason as their tooltip
// (Jake, 27 Nov 2026 — no silent no-ops).
import { useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { frameForCue } from '../lib/liveFrames'
import { isClipboardEmpty } from '../lib/livePageObjects'
import { DEFAULT_BUTTON_APPEARANCE_COLOR } from '../lib/liveButtonColor'
import { DEFAULT_OBJECT_STYLES } from '@shared/liveObjectDefaults'
import type { LiveControl } from '@shared/types'

type SubmenuItem = { key: string; label: string; checked?: boolean; action: () => void }
type MenuItem = {
  key: string
  label: string
  disabledReason?: string | null
  submenu?: SubmenuItem[]
  action?: () => void
}

export function CueButtonMenu({ controlId, onClose }: { controlId: string; onClose: () => void }) {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const control = useShowStore((s) => s.show?.livePages?.flatMap((p) => p.controls).find((c) => c.id === controlId))
  const page = useShowStore((s) => {
    const id = s.activeLivePageId
    return s.show?.livePages?.find((p) => p.id === id) ?? s.show?.livePages?.[0]
  })
  const manualOverrides = useShowStore((s) => s.manualOverrides)
  const pageClipboard = useShowStore((s) => s.pageClipboard)
  if (!control || !page) return null

  const state = useShowStore.getState()
  const run = (fn: () => void) => { fn(); onClose() }
  const openInfo = (tab: 'contents' | 'options' | 'button') =>
    window.dispatchEvent(new CustomEvent('openlights-open-cue-info', { detail: { controlId, tab } }))
  const isAutomaticColour = !control.appearance?.color || control.appearance.color.toLowerCase() === DEFAULT_BUTTON_APPEARANCE_COLOR
  const align = { ...DEFAULT_OBJECT_STYLES.cue, ...control.style }.align ?? 'center'
  const inFrame = frameForCue(page, controlId) !== null

  const items: MenuItem[] = [
    { key: 'getInfo', label: 'Get Info', action: () => openInfo('contents') },
    // Show Properties opens the same inspector as Get Info — the guide
    // uses "Get Info" for Live objects and "Show Properties" for Design
    // objects, and no source shows a second panel for a button.
    { key: 'showProperties', label: 'Show Properties', action: () => openInfo('contents') },
    {
      key: 'editAdHocProperties', label: 'Edit Ad Hoc Properties',
      action: () => {
        if (control.cueId) state.startEditingCueAdHoc(control.cueId)
        else window.dispatchEvent(new Event('openlights-open-live-properties'))
      },
    },
    {
      key: 'addOverrides', label: 'Add Overrides',
      disabledReason: Object.keys(manualOverrides).length ? null : 'No overridden properties to add',
      action: () => state.addOverridesToCues([controlId], false),
    },
    { key: 'cut', label: 'Cut', action: () => { state.copySelectedPageObjects(); state.deleteSelectedPageObjects() } },
    { key: 'copy', label: 'Copy', action: () => state.copySelectedPageObjects() },
    {
      key: 'paste', label: 'Paste',
      disabledReason: isClipboardEmpty(pageClipboard) ? 'Nothing to paste' : null,
      action: () => state.pastePageObjects(),
    },
    { key: 'rename', label: 'Rename', action: () => window.dispatchEvent(new CustomEvent('openlights-rename-live-control', { detail: { controlId } })) },
    { key: 'duplicate', label: 'Duplicate', action: () => state.duplicateSelectedPageObjects() },
    { key: 'delete', label: 'Delete', action: () => state.deleteSelectedPageObjects() },
    {
      key: 'controlType', label: 'Control Type',
      submenu: (['toggle', 'flash', 'fader'] as LiveControl['type'][]).map((type) => ({
        key: type,
        label: type === 'toggle' ? 'Toggle Button' : type === 'flash' ? 'Push Button' : 'Fader',
        checked: control.type === type,
        action: () => state.configureControlType(controlId, type),
      })),
    },
    {
      key: 'behavior', label: 'Behavior',
      // Behavior is a push-button setting (guide p.204); a fader has
      // no behavior. Toggle is our toggle type, Flash is our flash type.
      disabledReason: control.type === 'fader' ? 'Faders have no behavior' : null,
      submenu: [
        { key: 'toggle', label: 'Toggle', checked: control.type === 'toggle', action: () => state.configureControlType(controlId, 'toggle') },
        { key: 'flash', label: 'Flash', checked: control.type === 'flash', action: () => state.configureControlType(controlId, 'flash') },
      ],
    },
    // Priority / Modifiers / Font: the guide proves each field exists
    // (p.204–205) but not the values a menu submenu would offer, so
    // they stay parked — disabled, pointing at the inspector tab that
    // holds them. External Control is the same: MIDI mappings live in
    // Settings, not in this menu.
    { key: 'priority', label: 'Priority', disabledReason: 'Set the priority in the inspector' },
    {
      key: 'color', label: 'Color',
      submenu: [
        { key: 'automatic', label: 'Automatic', checked: isAutomaticColour, action: () => state.configureCueAppearance(controlId, { color: DEFAULT_BUTTON_APPEARANCE_COLOR }) },
        { key: 'custom', label: 'Custom…', action: () => openInfo('button') },
      ],
    },
    { key: 'modifiers', label: 'Modifiers', disabledReason: 'Add modifiers in the inspector' },
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
    { key: 'externalControl', label: 'External Control', disabledReason: 'External control is set up in Settings' },
  ]

  return <>
    {items.map((item) => {
      const disabled = item.disabledReason != null
      const expanded = openSubmenu === item.key
      return <div key={item.key}>
        <button type="button" role="menuitem" disabled={disabled} title={item.disabledReason ?? undefined} aria-haspopup={item.submenu ? 'menu' : undefined} aria-expanded={item.submenu ? expanded : undefined} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => {
          if (item.submenu) { setOpenSubmenu(expanded ? null : item.key); return }
          if (item.action) run(item.action)
        }}>{item.label}{item.submenu && <span className="float-right ml-4 text-dim">›</span>}</button>
        {item.submenu && expanded && <div role="menu" aria-label={`${item.label} options`} className="ml-4 border-l border-line pl-1">
          {item.submenu.map((sub) => (
            <button key={sub.key} type="button" role="menuitemradio" aria-checked={sub.checked === true} className="block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-panel2" onClick={() => run(sub.action)}>{sub.checked ? '✓ ' : ''}{sub.label}</button>
          ))}
        </div>}
      </div>
    })}
  </>
}
