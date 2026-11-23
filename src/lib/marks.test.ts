import { describe, it, expect } from 'vitest'
import { markIntervals } from './marks'

const cal = { pxPerMmX: 10, paperSpeedMmPerS: 25 } // 40 ms per 10 px
const P = (x: number) => ({ x, y: 0 })

describe('P to QRS marks', () => {
  it('gives P duration, PR interval and PR segment', () => {
    const r = markIntervals('pq', ['P onset', 'P end', 'QRS onset'], [P(100), P(125), P(140)], cal)
    expect(r.map(x => [x.key, Math.round(x.ms)])).toEqual([['pDur', 100], ['pr', 160], ['prSeg', 60]])
  })
})

describe('QRS marks', () => {
  it('gives QRS, R-wave peak time, onset to S nadir and notches', () => {
    const r = markIntervals('qrs', ['QRS onset', 'R peak', 'Notch', 'S nadir', 'QRS end'], [P(0), P(10), P(14), P(20), P(30)], cal)
    expect(r.map(x => [x.key, Math.round(x.ms)])).toEqual([['qrs', 120], ['rwat', 40], ['rs', 80], ['notch', 56]])
  })
  it('skipped roles just drop their interval', () => {
    const r = markIntervals('qrs', ['QRS onset', 'S nadir', 'QRS end'], [P(0), P(10), P(25)], cal)
    expect(r.map(x => x.key)).toEqual(['qrs', 'rs'])
  })
})
