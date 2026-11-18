import { describe, expect, it } from 'vitest'
import { inspectorFields } from '../src/renderer/src/lib/liveInspector'

describe('Live inspector field schema', () => {
  it('shows page fields', () => expect(inspectorFields('page')).toEqual(['name', 'fadeMs', 'defaultStyles']))
  it('shows frame configuration and common object fields', () => expect(inspectorFields('frame')).toEqual(expect.arrayContaining(['text', 'width', 'height', 'attachment', 'style', 'exclusive', 'intensity', 'speed'])))
  it('shows cue contents and options', () => expect(inspectorFields('cue')).toEqual(expect.arrayContaining(['name', 'controlType', 'cue', 'presets', 'sequences', 'adHocValues'])))
  it('shows cuelist selection and common fields', () => expect(inspectorFields('cuelist')).toEqual(expect.arrayContaining(['cueList', 'width', 'height', 'attachment', 'style'])))
  it('keeps labels limited to text and layout', () => expect(inspectorFields('label')).toEqual(['text', 'width', 'height', 'attachment', 'style']))
})
