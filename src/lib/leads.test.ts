import { describe, it, expect } from 'vitest'
import { stDeviationMm, heightMm, netQrsMm, frontalAxis } from './leads'

const base = { x: 0, y: 100 }
describe('ST deviation', () => {
  it('positive when J is above baseline', () => expect(stDeviationMm(base, { x: 5, y: 80 }, 10)).toBe(2))
  it('negative when J is below baseline', () => expect(stDeviationMm(base, { x: 5, y: 115 }, 10)).toBe(-1.5))
  it('QRS height is unsigned', () => expect(heightMm(base, { x: 0, y: 200 }, 10)).toBe(10))
})

describe('net QRS', () => {
  it('R minus S', () => expect(netQrsMm(base, { x: 0, y: 20 }, { x: 0, y: 130 }, 10)).toBe(5))
  it('ignores points on the wrong side', () => expect(netQrsMm(base, { x: 0, y: 120 }, { x: 0, y: 90 }, 10)).toBe(0))
})

describe('frontal axis', () => {
  it('lead I only positive, aVF zero -> 0 deg', () => expect(frontalAxis({ I: 5, aVF: 0 })).toBeCloseTo(0))
  it('aVF only positive -> +90', () => expect(frontalAxis({ I: 0, aVF: 5 })).toBeCloseTo(90))
  it('both positive and equal -> +45', () => expect(frontalAxis({ I: 5, aVF: 5 })).toBeCloseTo(45))
  it('I positive, aVF negative -> negative axis', () => expect(frontalAxis({ I: 5, aVF: -5 })).toBeCloseTo(-45))
  it('I negative, aVF positive -> beyond +90', () => expect(frontalAxis({ I: -5, aVF: 5 })).toBeCloseTo(135))
  it('both negative -> extreme quadrant', () => expect(frontalAxis({ I: -5, aVF: -5 })).toBeCloseTo(-135))
  it('consistent lead II refines the same vector (true axis 60)', () => {
    const p = (a: number) => 10 * Math.cos(((a - 60) * Math.PI) / 180)
    expect(frontalAxis({ I: p(0), aVF: p(90), II: p(60) })).toBeCloseTo(60)
  })
  it('null with one lead or zero vector', () => {
    expect(frontalAxis({ I: 5 })).toBeNull()
    expect(frontalAxis({ I: 0, aVF: 0 })).toBeNull()
  })
})
