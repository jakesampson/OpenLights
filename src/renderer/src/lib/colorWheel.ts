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
