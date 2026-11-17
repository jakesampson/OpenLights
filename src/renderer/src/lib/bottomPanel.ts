export type BottomPanelMode = 'scene-playback' | 'live-buttons' | 'cuelist-playback'

/** The bottom area is deliberately restricted to playback surfaces. */
export function bottomPanelMode(view: 'Design' | 'Live', hasCueListWidget: boolean): BottomPanelMode {
  if (view === 'Design') return 'scene-playback'
  return hasCueListWidget ? 'cuelist-playback' : 'live-buttons'
}

export const BOTTOM_PANEL_REGIONS = ['master', 'playback', 'shortcuts'] as const
