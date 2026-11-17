export type BottomPanelMode = 'fixture-controls' | 'live-buttons' | 'cuelist-playback'

/** The bottom area is deliberately restricted to playback surfaces. */
export function bottomPanelMode(view: 'Design' | 'Live', hasCueListWidget: boolean): BottomPanelMode {
  if (view === 'Design') return 'fixture-controls'
  return hasCueListWidget ? 'cuelist-playback' : 'live-buttons'
}

export const BOTTOM_PANEL_REGIONS = ['master', 'playback', 'shortcuts'] as const
export const LIVE_EDIT_ADD_KINDS = ['scene', 'cue', 'cuelist', 'label', 'frame'] as const
