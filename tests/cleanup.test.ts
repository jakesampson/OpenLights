import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('retired surfaces and USB-only output', () => {
  it('removes dead editors after their replacement workflows ship', () => {
    for (const name of ['EditTab.tsx', 'SceneGrid.tsx', 'CueListPanel.tsx', 'EffectsPanel.tsx', 'PresetEditor.tsx', 'SequenceEditor.tsx']) {
      expect(existsSync(join(process.cwd(), 'src/renderer/src/components', name))).toBe(false)
    }
  })

  it('does not expose network DMX runtime entry points', () => {
    const runtime = [
      readFileSync(join(process.cwd(), 'src/shared/dmx.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    ].join('\n').toLowerCase()
    expect(runtime).not.toContain('connectartnet')
    expect(runtime).not.toContain('connect-artnet')
    expect(runtime).not.toContain('buildartnetpacket')
    expect(runtime).not.toContain('node:dgram')
  })
})
