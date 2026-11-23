import type { Calibration } from './measure'
import { pxToMs, rateFromSpan } from './measure'

export interface SeriesStats {
  intervals: number[] // ms between consecutive tapped beats
  mean: number
  min: number
  max: number
  spread: number // max - min, ms
  rate: number // per minute from the mean interval
  /** For each tap, how far it sits from where the first interval marched out predicts it (ms, + = late). */
  deviation: number[]
}

/**
 * Plain measurements of a tapped series of P waves or R waves. It reports
 * numbers only; deciding regular or irregular is the user's call.
 */
export function seriesStats(xs: number[], cal: Pick<Calibration, 'pxPerMmX' | 'paperSpeedMmPerS'>): SeriesStats | null {
  const s = [...xs].sort((a, b) => a - b)
  if (s.length < 2) return null
  const ms = (px: number) => pxToMs(px, cal as Calibration)
  const intervals = s.slice(1).map((x, i) => ms(x - s[i]))
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const min = Math.min(...intervals), max = Math.max(...intervals)
  const step = s[1] - s[0]
  const deviation = s.map((x, k) => Math.sign(x - (s[0] + k * step)) * ms(x - (s[0] + k * step)))
  return { intervals, mean, min, max, spread: max - min, rate: rateFromSpan(mean), deviation }
}
