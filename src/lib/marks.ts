import type { Point, Calibration } from './measure'
import { pxToMs } from './measure'

/** Marks the user taps, in order, for each multi-mark tool. Notches can be added anywhere in a QRS. */
export const MARK_ROLES = {
  pq: ['P onset', 'P end', 'QRS onset'],
  qrs: ['QRS onset', 'R peak', 'S nadir', 'QRS end'],
} as const
export type MarkKind = keyof typeof MARK_ROLES
/** Roles the user may skip (e.g. a QS complex has no R peak). */
export const SKIPPABLE = new Set(['R peak', 'S nadir'])

export interface MarkResult { label: string; ms: number; key: string }

export function markIntervals(kind: MarkKind, roles: string[], pts: Point[], cal: Pick<Calibration, 'pxPerMmX' | 'paperSpeedMmPerS'>): MarkResult[] {
  const x = (r: string) => { const i = roles.indexOf(r); return i < 0 ? null : pts[i].x }
  const span = (a: string, b: string, label: string, key: string): MarkResult[] => {
    const xa = x(a), xb = x(b)
    if (xa == null || xb == null) return []
    return [{ label, key, ms: pxToMs(xb - xa, cal as Calibration) }]
  }
  if (kind === 'pq') {
    return [
      ...span('P onset', 'P end', 'P duration', 'pDur'),
      ...span('P onset', 'QRS onset', 'PR interval', 'pr'),
      ...span('P end', 'QRS onset', 'PR segment', 'prSeg'),
    ]
  }
  const out = [
    ...span('QRS onset', 'QRS end', 'QRS duration', 'qrs'),
    ...span('QRS onset', 'R peak', 'R-wave peak time', 'rwat'),
    ...span('QRS onset', 'S nadir', 'Onset to S nadir', 'rs'),
  ]
  const on = x('QRS onset')
  if (on != null) roles.forEach((r, i) => { if (r === 'Notch') out.push({ label: 'Onset to notch', key: 'notch', ms: pxToMs(pts[i].x - on, cal as Calibration) }) })
  return out
}
