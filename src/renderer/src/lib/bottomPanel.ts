export type BottomPanelMode = 'fixture-controls' | 'live-buttons' | 'cuelist-playback'

/** The bottom area is deliberately restricted to playback surfaces. */
export function bottomPanelMode(view: 'Design' | 'Live', hasCueListWidget: boolean): BottomPanelMode {
  if (view === 'Design') return 'fixture-controls'
  return hasCueListWidget ? 'cuelist-playback' : 'live-buttons'
}

export const BOTTOM_PANEL_REGIONS = ['master', 'playback', 'shortcuts'] as const
// LightKey has one kind of cue button (Guide ch.11, p.181): the old
// separate 'scene' button kind was the same thing under the old name.
export const LIVE_EDIT_ADD_KINDS = ['cue', 'cuelist', 'label', 'frame'] as const
