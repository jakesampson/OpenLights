/**
 * Estimate BPM from a decoded AudioBuffer using an onset envelope +
 * autocorrelation over the 60–190 BPM range. Returns null if the
 * signal is too quiet or no clear periodicity is found.
 */
export function detectBpm(buffer: AudioBuffer): number | null {
  const sampleRate = buffer.sampleRate
  const data = buffer.getChannelData(0)

  // Downsample to ~200 Hz onset envelope using max-abs per hop
  const targetRate = 200
  const hop = Math.max(1, Math.floor(sampleRate / targetRate))
  const frames = Math.floor(data.length / hop)
  if (frames < 200) return null

  const env = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let max = 0
    const start = f * hop
    for (let i = 0; i < hop; i++) {
      const v = Math.abs(data[start + i] ?? 0)
      if (v > max) max = v
    }
    env[f] = max
  }

  // Remove DC and take positive first difference (onset strength)
  let mean = 0
  for (let i = 0; i < frames; i++) mean += env[i]
  mean /= frames
  for (let i = 0; i < frames; i++) env[i] = Math.max(0, env[i] - mean)

  const onset = new Float32Array(frames)
  for (let i = 1; i < frames; i++) {
    onset[i] = Math.max(0, env[i] - env[i - 1])
  }

  // Autocorrelation for lags corresponding to 60..190 BPM
  const minBpm = 60
  const maxBpm = 190
  const minLag = Math.floor((60 / maxBpm) * targetRate)
  const maxLag = Math.ceil((60 / minBpm) * targetRate)

  let bestLag = -1
  let bestScore = 0

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0
    let norm = 0
    for (let i = 0; i + lag < frames; i++) {
      score += onset[i] * onset[i + lag]
      norm += onset[i] * onset[i]
    }
    if (norm > 0) score /= norm
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }

  if (bestLag < 0 || bestScore < 0.01) return null

  const bpm = (60 * targetRate) / bestLag

  // Fold into a practical tempo range
  let folded = bpm
  while (folded < 70) folded *= 2
  while (folded > 180) folded /= 2

  return Math.round(folded * 10) / 10
}