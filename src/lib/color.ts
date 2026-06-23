// Pure color helpers for legible text on arbitrary brand backgrounds.

function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance (0 = black … 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/**
 * Pick near-black or white text for a background so it stays legible on any
 * brand color. The crossover (L ≈ 0.179) is the point where black and white
 * give equal WCAG contrast on the background — above it black wins, below it
 * white wins. Returns the app's bg token color for "dark text".
 */
export function textColorOn(hex: string): '#0B0C10' | '#FFFFFF' {
  return relativeLuminance(hex) > 0.179 ? '#0B0C10' : '#FFFFFF'
}
