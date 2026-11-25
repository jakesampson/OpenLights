export type AppMenuCommand = 'new' | 'open' | 'save' | 'saveAs' | 'close' | 'undo' | 'redo' | 'zoomIn' | 'zoomOut' | 'zoomFit' | 'zoomSelection' | 'design' | 'live' | 'fullscreen' | 'blackout' | 'go' | 'next' | 'previous' | 'escape' | 'highlight' | 'beamDirection' | 'group' | 'addOverrides' | 'editAdHocProperties' | 'showOverrides' | 'settings' | 'openLiveWindow' | 'automation' | 'selectAll' | 'deselectAll' | 'beamColor' | 'fixtureOptions' | 'alignLeft' | 'alignRight' | 'alignTop' | 'alignBottom' | 'alignCenterX' | 'alignCenterY' | 'distributeX' | 'distributeY' | 'flipHorizontal' | 'flipVertical' | 'orderFront' | 'orderForward' | 'orderBackward' | 'orderBack'

/** Labels for menu commands that have no keyboard binding (and so no
 * SHORTCUTS entry to take a label from): Add Overrides / Edit Ad Hoc
 * Properties (Guide ch.11, pp.201–202), Show Properties (p.116), Open
 * Live window and Automation… (both moved here from the header
 * view-options menu, Jake 23 Nov 2026 — the view menu holds only the
 * three view toggles now). */
export const MENU_LABELS: Partial<Record<AppMenuCommand, string>> = {
  addOverrides: 'Add Overrides',
  editAdHocProperties: 'Edit Ad Hoc Properties',
  showOverrides: 'Show overridden properties',
  openLiveWindow: 'Open Live window',
  automation: 'Automation…'
}

export interface AppMenuGroup { label: string; items: { label: string; command?: AppMenuCommand; role?: 'about' | 'quit'; type?: 'separator'; submenu?: { label: string; command: AppMenuCommand }[] }[] }

export const WINDOWS_MENU: AppMenuGroup[] = [
  { label: 'File', items: [{ label: 'New', command: 'new' }, { label: 'Open…', command: 'open' }, { label: 'Save', command: 'save' }, { label: 'Save As…', command: 'saveAs' }, { label: 'Close Project', command: 'close' }] },
  { label: 'Edit', items: [{ label: 'Undo', command: 'undo' }, { label: 'Redo', command: 'redo' }, { label: '', type: 'separator' }, { label: 'Select All', command: 'selectAll' }, { label: 'Deselect All', command: 'deselectAll' }] },
  { label: 'View', items: [{ label: 'Zoom In', command: 'zoomIn' }, { label: 'Zoom Out', command: 'zoomOut' }, { label: 'Zoom to Fit', command: 'zoomFit' }, { label: 'Zoom to Selection', command: 'zoomSelection' }, { label: 'Design', command: 'design' }, { label: 'Live', command: 'live' }, { label: 'Highlight Mode', command: 'highlight' }, { label: 'Automation…', command: 'automation' }, { label: 'Settings…', command: 'settings' }] },
  // Layout (Guide ch.7): Beam Direction… / Beam Color… / Fixture
  // Options… first, then the Align / Distribute / Flip / Order
  // submenus, then Group. Select All lives in the Edit menu (Guide
  // pp.53, 72), not here — the old Inspector's Layout section (Select
  // all, Align / distribute…) is gone; these menus are its home.
  { label: 'Layout', items: [{ label: 'Beam Direction…', command: 'beamDirection' }, { label: 'Beam Color…', command: 'beamColor' }, { label: 'Fixture Options…', command: 'fixtureOptions' }, { label: '', type: 'separator' }, { label: 'Align', submenu: [{ label: 'Left', command: 'alignLeft' }, { label: 'Right', command: 'alignRight' }, { label: 'Top', command: 'alignTop' }, { label: 'Bottom', command: 'alignBottom' }, { label: 'Centre Horizontally', command: 'alignCenterX' }, { label: 'Centre Vertically', command: 'alignCenterY' }] }, { label: 'Distribute', submenu: [{ label: 'Horizontally', command: 'distributeX' }, { label: 'Vertically', command: 'distributeY' }] }, { label: 'Flip', submenu: [{ label: 'Horizontally', command: 'flipHorizontal' }, { label: 'Vertically', command: 'flipVertical' }] }, { label: 'Order', submenu: [{ label: 'Bring to Front', command: 'orderFront' }, { label: 'Bring Forward', command: 'orderForward' }, { label: 'Send Backward', command: 'orderBackward' }, { label: 'Send to Back', command: 'orderBack' }] }, { label: '', type: 'separator' }, { label: 'Group', command: 'group' }] },
  { label: 'Live', items: [{ label: 'Blackout', command: 'blackout' }, { label: 'Go', command: 'go' }, { label: 'Next Cue', command: 'next' }, { label: 'Previous Cue', command: 'previous' }, { label: 'Stop', command: 'escape' }, { label: 'Add Overrides', command: 'addOverrides' }, { label: 'Edit Ad Hoc Properties', command: 'editAdHocProperties' }] },
  { label: 'Window', items: [{ label: 'Open Live window', command: 'openLiveWindow' }, { label: 'Full Screen', command: 'fullscreen' }] },
  { label: 'Help', items: [{ label: 'About OpenLights', role: 'about' }] }
]

/**
 * The standard macOS application menu (Jake, 24 Nov 2026 — Cmd+Q did
 * nothing: the custom menu had no app menu and no Quit role, so the
 * keystroke was never bound to anything). Electron gives a role 'quit'
 * item the label "Quit OpenLights" and the Cmd+Q accelerator
 * automatically, and a role 'about' item the same treatment. Windows and
 * Linux keep exactly WINDOWS_MENU — no app menu there.
 */
export function macAppMenu(appName: string): AppMenuGroup {
  return {
    label: appName,
    items: [
      { label: `About ${appName}`, role: 'about' },
      { label: '', type: 'separator' },
      { label: `Quit ${appName}`, role: 'quit' }
    ]
  }
}

/** The full menu groups for a platform: the macOS app menu first on
 * darwin, WINDOWS_MENU alone everywhere else. */
export function menuGroupsFor(platform: string, appName: string): AppMenuGroup[] {
  return platform === 'darwin' ? [macAppMenu(appName), ...WINDOWS_MENU] : WINDOWS_MENU
}

export const CONTEXT_MENUS = {  fixture: ['group', 'beamDirection', 'beamColor', 'fixtureOptions', 'highlight', 'undo', 'redo', 'design'],
  preset: ['undo', 'redo', 'live'],
  // Add Overrides / Edit Ad Hoc Properties (Guide ch.11, pp.201–202):
  // Control-click a button in the Live view or a cue in a cuelist.
  cue: ['go', 'escape', 'live', 'addOverrides', 'editAdHocProperties'],
  page: ['live', 'undo', 'redo']
} satisfies Record<'fixture' | 'preset' | 'cue' | 'page', AppMenuCommand[]>
