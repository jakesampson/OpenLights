import { describe, expect, it } from 'vitest'
import { incrementShortName, normalizeShortName, proposeShortName, shortNameAt, shortNameBaseFor } from '../src/shared/shortNames'

describe('fixture short names (LightKey Guide p.30)', () => {
  it('proposes a type-based short name with the first free number', () => {
    expect(shortNameBaseFor('moving-head')).toBe('MH')
    expect(shortNameBaseFor('par')).toBe('P')
    expect(proposeShortName([], 'moving-head')).toBe('MH1')
    expect(proposeShortName(['MH1', 'MH2'], 'moving-head')).toBe('MH3')
    expect(proposeShortName(['mh1'], 'moving-head')).toBe('MH2')
  })

  it('increments a trailing number for a batch, and appends one without', () => {
    expect(incrementShortName('MH6')).toBe('MH7')
    expect(incrementShortName('MH')).toBeNull()
    expect(incrementShortName('MH1', -1)).toBe('MH0')
    expect(shortNameAt('MH6', 3, 4)).toBe('MH9')
    expect(shortNameAt('MH6', 0, 4)).toBe('MH6')
    expect(shortNameAt('MH', 2, 6)).toBe('MH3')
    expect(shortNameAt('MH', 0, 1)).toBe('MH')
  })

  it('trims a typed short name to four characters', () => {
    expect(normalizeShortName('  MH1 ')).toBe('MH1')
    expect(normalizeShortName('ABCDE')).toBe('ABCD')
    expect(normalizeShortName('   ')).toBeNull()
    expect(normalizeShortName(undefined)).toBeNull()
  })
})
