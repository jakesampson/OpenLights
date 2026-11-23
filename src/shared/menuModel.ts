export type AppMenuCommand = 'new' | 'open' | 'save' | 'saveAs' | 'close' | 'undo' | 'redo' | 'zoomIn' | 'zoomOut' | 'zoomFit' | 'zoomSelection' | 'design' | 'live' | 'fullscreen' | 'blackout' | 'go' | 'next' | 'previous' | 'escape' | 'highlight' | 'beamDirection' | 'group' | 'addOverrides' | 'editAdHocProperties' | 'showOverrides' | 'settings' | 'openLiveWindow' | 'automation' | 'ndiAmbience'

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
  automation: 'Automation…',
  ndiAmbience: 'NDI Ambience…'
}

export interface AppMenuGroup { label: 'File' | 'Edit' | 'View' | 'Layout' | 'Live' | 'Window' | 'Help'; items: { label: string; command?: AppMenuCommand; role?: 'about' }[] }

export const WINDOWS_MENU: AppMenuGroup[] = [
  { label: 'File', items: [{ label: 'New', command: 'new' }, { label: 'Open…', command: 'open' }, { label: 'Save', command: 'save' }, { label: 'Save As…', command: 'saveAs' }, { label: 'Close Project', command: 'close' }] },
  { label: 'Edit', items: [{ label: 'Undo', command: 'undo' }, { label: 'Redo', command: 'redo' }] },
  { label: 'View', items: [{ label: 'Zoom In', command: 'zoomIn' }, { label: 'Zoom Out', command: 'zoomOut' }, { label: 'Zoom to Fit', command: 'zoomFit' }, { label: 'Zoom to Selection', command: 'zoomSelection' }, { label: 'Design', command: 'design' }, { label: 'Live', command: 'live' }, { label: 'Highlight Mode', command: 'highlight' }, { label: 'Automation…', command: 'automation' }, { label: 'NDI Ambience…', command: 'ndiAmbience' }, { label: 'Settings…', command: 'settings' }] },
  { label: 'Layout', items: [{ label: 'Beam Direction…', command: 'beamDirection' }, { label: 'Group', command: 'group' }] },
  { label: 'Live', items: [{ label: 'Blackout', command: 'blackout' }, { label: 'Go', command: 'go' }, { label: 'Next Cue', command: 'next' }, { label: 'Previous Cue', command: 'previous' }, { label: 'Stop', command: 'escape' }, { label: 'Add Overrides', command: 'addOverrides' }, { label: 'Edit Ad Hoc Properties', command: 'editAdHocProperties' }] },
  { label: 'Window', items: [{ label: 'Open Live window', command: 'openLiveWindow' }, { label: 'Full Screen', command: 'fullscreen' }] },
  { label: 'Help', items: [{ label: 'About OpenLights', role: 'about' }] }
]

export const CONTEXT_MENUS = {
  fixture: ['group', 'beamDirection', 'highlight', 'undo', 'redo', 'design'],
  preset: ['undo', 'redo', 'live'],
  // Add Overrides / Edit Ad Hoc Properties (Guide ch.11, pp.201–202):
  // Control-click a button in the Live view or a cue in a cuelist.
  cue: ['go', 'escape', 'live', 'addOverrides', 'editAdHocProperties'],
  page: ['live', 'undo', 'redo']
} satisfies Record<'fixture' | 'preset' | 'cue' | 'page', AppMenuCommand[]>
