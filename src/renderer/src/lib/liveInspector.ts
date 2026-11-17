export type InspectorTarget = 'page' | 'frame' | 'cue' | 'cuelist' | 'label'
export type InspectorField =
  | 'name' | 'fadeMs' | 'defaultStyles'
  | 'text' | 'width' | 'height' | 'attachment' | 'style'
  | 'exclusive' | 'intensity' | 'speed'
  | 'controlType' | 'scene' | 'presets' | 'sequences' | 'adHocValues'
  | 'cueList'

const SCHEMA: Record<InspectorTarget, readonly InspectorField[]> = {
  page: ['name', 'fadeMs', 'defaultStyles'],
  frame: ['text', 'width', 'height', 'attachment', 'style', 'exclusive', 'intensity', 'speed'],
  cue: ['name', 'width', 'height', 'attachment', 'style', 'controlType', 'scene', 'presets', 'sequences', 'adHocValues'],
  cuelist: ['width', 'height', 'attachment', 'style', 'cueList'],
  label: ['text', 'width', 'height', 'attachment', 'style']
}

export function inspectorFields(target: InspectorTarget): readonly InspectorField[] {
  return SCHEMA[target]
}
