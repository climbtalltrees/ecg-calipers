import { describe, it, expect } from 'vitest'
import { pxPerMm, pxToMs, pxToMv, rateFromSpan, qtcBazett, qtcFridericia, type Calibration } from './measure'

const cal: Calibration = { pxPerMmX: 10, pxPerMmY: 8, paperSpeedMmPerS: 25, gainMmPerMv: 10 }

describe('calibration', () => {
  it('derives px per mm on each axis', () => {
    expect(pxPerMm({ x: 0, y: 0 }, { x: 250, y: 3 }, 'x', 25)).toBe(10)
    expect(pxPerMm({ x: 0, y: 0 }, { x: 3, y: -80 }, 'y', 10)).toBe(8)
  })
  it('rejects zero distances', () => {
    expect(() => pxPerMm({ x: 1, y: 1 }, { x: 1, y: 1 }, 'x', 5)).toThrow()
    expect(() => pxPerMm({ x: 0, y: 0 }, { x: 5, y: 0 }, 'x', 0)).toThrow()
  })
})

describe('conversions', () => {
  it('one small box at 25 mm/s is 40 ms', () => {
    expect(pxToMs(10, cal)).toBeCloseTo(40)
  })
  it('one large box is 200 ms', () => {
    expect(pxToMs(50, cal)).toBeCloseTo(200)
  })
  it('50 mm/s halves the time', () => {
    expect(pxToMs(50, { ...cal, paperSpeedMmPerS: 50 })).toBeCloseTo(100)
  })
  it('10 mm at 10 mm/mV is 1 mV', () => {
    expect(pxToMv(80, cal)).toBeCloseTo(1)
  })
})

describe('rate', () => {
  it('RR 1000 ms is 60/min', () => expect(rateFromSpan(1000)).toBeCloseTo(60))
  it('averages over several beats', () => expect(rateFromSpan(3000, 4)).toBeCloseTo(80))
  it('returns NaN for bad input', () => expect(rateFromSpan(0)).toBeNaN())
})

describe('QTc', () => {
  it('equals QT when RR is 1 s', () => {
    expect(qtcBazett(400, 1000)).toBeCloseTo(400)
    expect(qtcFridericia(400, 1000)).toBeCloseTo(400)
  })
  it('corrects upward at faster rates', () => {
    expect(qtcBazett(360, 640)).toBeCloseTo(450)
    expect(qtcFridericia(360, 512)).toBeCloseTo(450)
  })
})
