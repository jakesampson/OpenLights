export type AppMenuCommand = 'new' | 'open' | 'save' | 'saveAs' | 'close' | 'undo' | 'redo' | 'zoomIn' | 'zoomOut' | 'zoomFit' | 'zoomSelection' | 'design' | 'live' | 'fullscreen' | 'blackout' | 'go' | 'next' | 'previous' | 'escape'

export interface AppMenuGroup { label: 'File' | 'Edit' | 'View' | 'Live' | 'Window' | 'Help'; items: { label: string; command?: AppMenuCommand; role?: 'about' }[] }

export const WINDOWS_MENU: AppMenuGroup[] = [
  { label: 'File', items: [{ label: 'New', command: 'new' }, { label: 'Open…', command: 'open' }, { label: 'Save', command: 'save' }, { label: 'Save As…', command: 'saveAs' }, { label: 'Close Project', command: 'close' }] },
  { label: 'Edit', items: [{ label: 'Undo', command: 'undo' }, { label: 'Redo', command: 'redo' }] },
  { label: 'View', items: [{ label: 'Zoom In', command: 'zoomIn' }, { label: 'Zoom Out', command: 'zoomOut' }, { label: 'Zoom to Fit', command: 'zoomFit' }, { label: 'Zoom to Selection', command: 'zoomSelection' }, { label: 'Design', command: 'design' }, { label: 'Live', command: 'live' }] },
  { label: 'Live', items: [{ label: 'Blackout', command: 'blackout' }, { label: 'Go', command: 'go' }, { label: 'Next Cue', command: 'next' }, { label: 'Previous Cue', command: 'previous' }, { label: 'Stop', command: 'escape' }] },
  { label: 'Window', items: [{ label: 'Full Screen', command: 'fullscreen' }] },
  { label: 'Help', items: [{ label: 'About OpenLights', role: 'about' }] }
]

export const CONTEXT_MENUS = {
  fixture: ['undo', 'redo', 'design'],
  preset: ['undo', 'redo', 'live'],
  cue: ['go', 'escape', 'live'],
  page: ['live', 'undo', 'redo']
} satisfies Record<'fixture' | 'preset' | 'cue' | 'page', AppMenuCommand[]>
