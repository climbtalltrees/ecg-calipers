import { describe, it, expect } from 'vitest'
import { seriesStats } from './rhythm'

const cal = { pxPerMmX: 10, paperSpeedMmPerS: 25 } // 200 px = 800 ms

describe('beat series', () => {
  it('regular series marches exactly', () => {
    const r = seriesStats([100, 300, 500, 700], cal)!
    expect(r.intervals.map(Math.round)).toEqual([800, 800, 800])
    expect(Math.round(r.rate)).toBe(75)
    expect(r.spread).toBeCloseTo(0)
    expect(r.deviation.map(Math.round)).toEqual([0, 0, 0, 0])
  })
  it('reports spread and drift from the marched position', () => {
    const r = seriesStats([700, 100, 300, 480], cal)! // order of taps does not matter
    expect(r.intervals.map(Math.round)).toEqual([800, 720, 880])
    expect(Math.round(r.spread)).toBe(160)
    expect(r.deviation.map(Math.round)).toEqual([0, 0, -80, 0])
  })
  it('needs two beats', () => expect(seriesStats([5], cal)).toBeNull())
})
