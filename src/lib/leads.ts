import type { Point } from './measure'

export const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const
export type Lead = (typeof LEADS)[number]

/** Hexaxial frontal-plane angles in degrees (lead I = 0, aVF = +90, positive is clockwise/downward). */
export const FRONTAL_ANGLE: Partial<Record<Lead, number>> = {
  I: 0, II: 60, III: 120, aVF: 90, aVL: -30, aVR: -150,
}

/**
 * ST deviation in mm relative to a user-tapped baseline. Image y grows downward,
 * so a J point above the baseline is positive (elevation).
 */
export function stDeviationMm(baseline: Point, j: Point, pxPerMmY: number): number {
  return (baseline.y - j.y) / pxPerMmY
}

/** Height of a user-tapped QRS point from baseline in mm (always positive). */
export function heightMm(baseline: Point, p: Point, pxPerMmY: number): number {
  return Math.abs(baseline.y - p.y) / pxPerMmY
}

/** Net QRS deflection in mm: R height above baseline minus S depth below it. */
export function netQrsMm(baseline: Point, rTop: Point, sBottom: Point, pxPerMmY: number): number {
  const r = Math.max(0, baseline.y - rTop.y)
  const s = Math.max(0, sBottom.y - baseline.y)
  return (r - s) / pxPerMmY
}

/**
 * Frontal-plane QRS axis in degrees (-180..180] from net QRS deflections in
 * frontal leads. Least-squares fit of net = Mx*cos(a) + My*sin(a). Needs at
 * least two leads with different angles; returns null otherwise or if all
 * deflections are zero.
 */
export function frontalAxis(nets: Partial<Record<Lead, number>>): number | null {
  let sxx = 0, sxy = 0, syy = 0, bx = 0, by = 0, n = 0
  for (const [lead, v] of Object.entries(nets) as [Lead, number][]) {
    const ang = FRONTAL_ANGLE[lead]
    if (ang == null || !isFinite(v)) continue
    const c = Math.cos((ang * Math.PI) / 180), s = Math.sin((ang * Math.PI) / 180)
    sxx += c * c; sxy += c * s; syy += s * s; bx += c * v; by += s * v; n++
  }
  const det = sxx * syy - sxy * sxy
  if (n < 2 || Math.abs(det) < 1e-9) return null
  const mx = (syy * bx - sxy * by) / det
  const my = (sxx * by - sxy * bx) / det
  if (Math.hypot(mx, my) < 1e-9) return null
  const deg = (Math.atan2(my, mx) * 180) / Math.PI
  return deg <= -180 ? deg + 360 : deg
}
