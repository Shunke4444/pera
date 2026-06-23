import { describe, it, expect } from 'vitest'
import { textColorOn, relativeLuminance } from './color'

describe('relativeLuminance', () => {
  it('is 0 for black and ~1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5)
  })
})

describe('textColorOn', () => {
  it('returns near-black text on white / very light backgrounds', () => {
    expect(textColorOn('#FFFFFF')).toBe('#0B0C10')
    expect(textColorOn('#FBBF24')).toBe('#0B0C10') // amber
  })

  it('returns white text on black / very dark backgrounds', () => {
    expect(textColorOn('#000000')).toBe('#FFFFFF')
    expect(textColorOn('#0B0C10')).toBe('#FFFFFF') // app bg
    expect(textColorOn('#1E3A8A')).toBe('#FFFFFF') // navy
  })

  it('keeps brand account colors legible', () => {
    // Light-ish brands → dark text
    expect(textColorOn('#22C55E')).toBe('#0B0C10') // Maya green
    expect(textColorOn('#F97316')).toBe('#0B0C10') // Maribank orange
    expect(textColorOn('#14B8A6')).toBe('#0B0C10') // AUB teal
    expect(textColorOn('#9AA0AA')).toBe('#0B0C10') // Cash gray
  })

  it('accepts 3-digit hex and missing leading #', () => {
    expect(textColorOn('fff')).toBe('#0B0C10')
    expect(textColorOn('000')).toBe('#FFFFFF')
  })
})
