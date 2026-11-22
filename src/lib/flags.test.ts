import { describe, it, expect } from 'vitest'
import { qrsFlag, qtcFlag, stFlag, axisFlag, stElevationThresholdMv } from './flags'

const M40 = { sex: 'male', age: '40plus' } as const
const M39 = { sex: 'male', age: 'under40' } as const
const F = { sex: 'female', age: 'unset' } as const
const U = { sex: 'unset', age: 'unset' } as const

describe('QRS', () => {
  it('110 is not flagged, 111 is, 120 meets BBB criterion', () => {
    expect(qrsFlag(110)).toBeNull()
    expect(qrsFlag(111)?.rule).toBe('qrsAdult')
    expect(qrsFlag(120)?.rule).toBe('qrsBbb')
  })
})

describe('QTc', () => {
  it('sex-specific prolonged limits', () => {
    expect(qtcFlag(449, M40)).toBeNull()
    expect(qtcFlag(450, M40)?.level).toBe('high')
    expect(qtcFlag(455, F)).toBeNull()
    expect(qtcFlag(460, F)?.level).toBe('high')
  })
  it('short QT', () => expect(qtcFlag(390, U)?.level).toBe('low'))
  it('asks for sex when it matters', () => expect(qtcFlag(455, U)?.level).toBe('info'))
})

describe('ST', () => {
  it('V2-V3 thresholds by sex and age', () => {
    expect(stElevationThresholdMv('V2', M40)).toBe(0.2)
    expect(stElevationThresholdMv('V3', M39)).toBe(0.25)
    expect(stElevationThresholdMv('V2', F)).toBe(0.15)
    expect(stElevationThresholdMv('V2', U)).toBeNull()
    expect(stElevationThresholdMv('II', U)).toBe(0.1)
  })
  it('flags elevation at threshold, not below', () => {
    expect(stFlag('II', 0.1, U)?.level).toBe('high')
    expect(stFlag('II', 0.09, U)).toBeNull()
    expect(stFlag('V2', 0.2, M39)).toBeNull()
    expect(stFlag('V2', 0.25, M39)?.level).toBe('high')
  })
  it('depression thresholds', () => {
    expect(stFlag('V2', -0.05, U)?.rule).toBe('stDep')
    expect(stFlag('II', -0.05, U)).toBeNull()
    expect(stFlag('II', -0.1, U)?.rule).toBe('stDep')
  })
})

describe('axis', () => {
  it('classifies by Part III ranges', () => {
    expect(axisFlag(60)?.level).toBe('info')
    expect(axisFlag(-30)?.text).toMatch(/Moderate left/)
    expect(axisFlag(-60)?.text).toMatch(/Marked left/)
    expect(axisFlag(100)?.text).toMatch(/Moderate right/)
    expect(axisFlag(150)?.text).toMatch(/Marked right/)
    expect(axisFlag(-120)?.text).toMatch(/outside/)
  })
})
