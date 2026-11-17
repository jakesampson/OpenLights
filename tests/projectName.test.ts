import { describe, expect, it } from 'vitest'
import { projectNameFromPath } from '../src/renderer/src/lib/projectName'

describe('project filenames', () => {
  it('uses the filename without the JSON extension on Windows and macOS', () => {
    expect(projectNameFromPath('C:\\Shows\\PRBC Default.json')).toBe('PRBC Default')
    expect(projectNameFromPath('/shows/Sunday.Set.JSON')).toBe('Sunday.Set')
  })
})
