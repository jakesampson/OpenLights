export function colorWheelPosition(values: Record<string, number>) {
  const red = Math.max(0, Math.min(255, values.red ?? 0)) / 255
  const green = Math.max(0, Math.min(255, values.green ?? 0)) / 255
  const blue = Math.max(0, Math.min(255, values.blue ?? 0)) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const difference = maximum - minimum
  let hue = 0

  if (difference > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / difference) % 6)
    else if (maximum === green) hue = 60 * ((blue - red) / difference + 2)
    else hue = 60 * ((red - green) / difference + 4)
  }
  if (hue < 0) hue += 360

  const angle = ((hue - 90) * Math.PI) / 180
  const radius = maximum > 0 ? (difference / maximum) * 36 : 0
  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius
  }
}

/** RGB (0–255 per channel) to HSV: hue 0–360, saturation and value 0–100.
    The inverse of the hue ring / saturation / brightness arcs of LightKey's
    round Color control (Guide p.82–84). */
export function rgbToHsv(values: Record<string, number>): { h: number; s: number; v: number } {
  const red = Math.max(0, Math.min(255, values.red ?? 0)) / 255
  const green = Math.max(0, Math.min(255, values.green ?? 0)) / 255
  const blue = Math.max(0, Math.min(255, values.blue ?? 0)) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const difference = maximum - minimum
  let hue = 0
  if (difference > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / difference) % 6)
    else if (maximum === green) hue = 60 * ((blue - red) / difference + 2)
    else hue = 60 * ((red - green) / difference + 4)
  }
  if (hue < 0) hue += 360
  return {
    h: Math.round(hue),
    s: maximum > 0 ? Math.round((difference / maximum) * 100) : 0,
    v: Math.round(maximum * 100)
  }
}

/** HSV (hue 0–360, saturation and value 0–100) to RGB, 0–255 per channel. */
export function hsvToRgb(h: number, s: number, v: number): { red: number; green: number; blue: number } {
  const hue = ((h % 360) + 360) % 360
  const saturation = Math.max(0, Math.min(100, s)) / 100
  const value = Math.max(0, Math.min(100, v)) / 100
  const c = value * saturation
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = value - c
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  return { red: Math.round((r + m) * 255), green: Math.round((g + m) * 255), blue: Math.round((b + m) * 255) }
}

/**
 * The HSV the round Color control displays for a fixture colour. RGB is a
 * lossy store for HSV: at value 0 (black) the hue and saturation are
 * undefined, and at saturation 0 (grey/white) the hue is undefined — so
 * deriving the wheel from the fixture's RGB destroys them, and every hue
 * or saturation change round-trips to the same black or grey (Jake,
 * 19 Nov 2026: the wheel looked dead on a black fixture, and dragging
 * brightness to 0 locked colour selection). Hue and saturation are
 * therefore independent controls: they come from the last hue/saturation
 * the wheel itself chose (`preserved`) while the colour is degenerate,
 * and from the fixture's colour otherwise. Brightness always comes from
 * the fixture — it is the one component RGB does represent.
 */
export function displayHsv(raw: { h: number; s: number; v: number }, preserved: { h: number; s: number }): { h: number; s: number; v: number } {
  return {
    h: raw.s > 0 ? raw.h : preserved.h,
    s: raw.v > 0 ? raw.s : preserved.s,
    v: raw.v
  }
}
