// Pure measurement math. No clinical thresholds live here: those come only
// from cited reference documents (see src/lib/references.ts when added).

export interface Point { x: number; y: number }

/** Calibration maps image pixels to paper millimetres, per axis. */
export interface Calibration {
  pxPerMmX: number
  pxPerMmY: number
  paperSpeedMmPerS: number // usually 25 or 50
  gainMmPerMv: number // usually 10
}

/** Pixels per mm from two tapped points spanning a known number of mm along one axis. */
export function pxPerMm(a: Point, b: Point, axis: 'x' | 'y', knownMm: number): number {
  if (!(knownMm > 0)) throw new Error('Known distance must be greater than zero')
  const d = axis === 'x' ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y)
  if (d === 0) throw new Error('The two calibration points are on top of each other')
  return d / knownMm
}

export function pxToMs(px: number, cal: Calibration): number {
  return (Math.abs(px) / cal.pxPerMmX / cal.paperSpeedMmPerS) * 1000
}

export function pxToMm(px: number, cal: Calibration, axis: 'x' | 'y'): number {
  return Math.abs(px) / (axis === 'x' ? cal.pxPerMmX : cal.pxPerMmY)
}

/** Vertical pixels to millivolts. */
export function pxToMv(px: number, cal: Calibration): number {
  return pxToMm(px, cal, 'y') / cal.gainMmPerMv
}

/** Heart rate (beats per minute) from the span of `beats` R-R intervals in ms. */
export function rateFromSpan(spanMs: number, beats = 1): number {
  if (!(spanMs > 0) || !(beats >= 1)) return NaN
  return 60000 / (spanMs / beats)
}

/** Bazett: QT / sqrt(RR in seconds). Returns ms. */
export function qtcBazett(qtMs: number, rrMs: number): number {
  return qtMs / Math.sqrt(rrMs / 1000)
}

/** Fridericia: QT / cbrt(RR in seconds). Returns ms. */
export function qtcFridericia(qtMs: number, rrMs: number): number {
  return qtMs / Math.cbrt(rrMs / 1000)
}
