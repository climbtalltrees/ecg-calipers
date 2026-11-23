import type { Lead } from './leads'
import type { RuleId } from './references'

export type Sex = 'unset' | 'male' | 'female'
export type AgeBand = 'unset' | 'under40' | '40plus'
export interface Patient { sex: Sex; age: AgeBand }

export interface Flag { level: 'high' | 'low' | 'info'; text: string; rule: RuleId }

/** All flags are for adults (over 16), per the cited documents. */

export function qrsFlag(qrsMs: number | null): Flag | null {
  if (qrsMs == null) return null
  if (qrsMs >= 120) return { level: 'high', text: '≥120 ms: meets the QRS-duration criterion for complete bundle branch block', rule: 'qrsBbb' }
  if (qrsMs > 110) return { level: 'high', text: '>110 ms: abnormal for age over 16', rule: 'qrsAdult' }
  return null
}

export function qtcFlag(qtcMs: number | null, p: Patient): Flag | null {
  if (qtcMs == null) return null
  if (qtcMs <= 390) return { level: 'low', text: '≤390 ms: short QT', rule: 'qtShort' }
  if (p.sex === 'unset') return qtcMs >= 450 ? { level: 'info', text: 'Set sex to check for prolonged QT (limit 450 ms men, 460 ms women)', rule: 'qtLong' } : null
  const limit = p.sex === 'female' ? 460 : 450
  if (qtcMs >= limit) return { level: 'high', text: `≥${limit} ms: prolonged QT (${p.sex === 'female' ? 'women' : 'men'})`, rule: 'qtLong' }
  return null
}

/** Elevation threshold in mV for a lead, or null when it depends on unset patient details. */
export function stElevationThresholdMv(lead: Lead, p: Patient): number | null {
  if (lead !== 'V2' && lead !== 'V3') return 0.1
  if (p.sex === 'female') return 0.15
  if (p.sex === 'male') return p.age === 'unset' ? null : p.age === 'under40' ? 0.25 : 0.2
  return null
}

export function stDepressionThresholdMv(lead: Lead): number {
  return lead === 'V2' || lead === 'V3' ? -0.05 : -0.1
}

export function stFlag(lead: Lead, stMv: number, p: Patient): Flag | null {
  if (stMv > 0) {
    const t = stElevationThresholdMv(lead, p)
    if (t == null) return { level: 'info', text: 'Set sex (and age for men) to check V2–V3 elevation', rule: 'stV23' }
    // Compare in hundredths of a mV so a value read as exactly the threshold counts.
    if (Math.round(stMv * 100) >= Math.round(t * 100)) return { level: 'high', text: `Elevation at or above ${t} mV`, rule: lead === 'V2' || lead === 'V3' ? 'stV23' : 'stOther' }
    return null
  }
  const d = stDepressionThresholdMv(lead)
  if (Math.round(stMv * 100) <= Math.round(d * 100)) return { level: 'high', text: `Depression at or beyond ${d} mV`, rule: 'stDep' }
  return null
}

export function axisFlag(deg: number | null): Flag | null {
  if (deg == null) return null
  if (deg > -30 && deg <= 90) return { level: 'info', text: 'Normal range (−30° to 90°)', rule: 'axis' }
  if (deg <= -30 && deg >= -45) return { level: 'high', text: 'Moderate left-axis deviation', rule: 'axis' }
  if (deg < -45 && deg >= -90) return { level: 'high', text: 'Marked left-axis deviation', rule: 'axis' }
  if (deg > 90 && deg <= 120) return { level: 'high', text: 'Moderate right-axis deviation', rule: 'axis' }
  if (deg > 120) return { level: 'high', text: 'Marked right-axis deviation', rule: 'axis' }
  return { level: 'high', text: 'Between −90° and −180°: outside the ranges this source classifies', rule: 'axis' }
}

/** R-wave peak time (QRS onset to R peak) against the Part III criteria that use it. */
export function rwatFlag(lead: Lead, ms: number | null): Flag | null {
  if (ms == null) return null
  if ((lead === 'V5' || lead === 'V6') && ms > 60) return { level: 'high', text: '>60 ms in V5/V6: meets the R-peak-time criterion for complete LBBB (needs normal V1–V3)', rule: 'rwatV56' }
  if (lead === 'aVL' && Math.round(ms) >= 45) return { level: 'high', text: '≥45 ms in aVL: meets the R-peak-time criterion for left anterior fascicular block', rule: 'rwatAvl' }
  return null
}
