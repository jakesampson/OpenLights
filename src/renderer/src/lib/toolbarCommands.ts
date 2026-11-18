export type ToolbarCommand = 'design' | 'live' | 'blackout' | 'tap'
export function runToolbarCommand(command: ToolbarCommand, actions: Record<ToolbarCommand, () => void>) { actions[command]() }
