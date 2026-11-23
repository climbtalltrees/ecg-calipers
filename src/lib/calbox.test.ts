import { describe, it, expect } from 'vitest'
import { isSquareOn, scaleFromBox, squareAt, type Quad } from './calbox'

describe('calibration box', () => {
  it('square box at 10 px/mm over one large box', () => {
    const q = squareAt({ x: 100, y: 100 }, 25)
    expect(isSquareOn(q)).toBe(true)
    expect(scaleFromBox(q, 5, 5)).toEqual({ x: 10, y: 10 })
  })
  it('different x and y scale', () => {
    const q: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 0, y: 40 }]
    expect(scaleFromBox(q, 10, 5)).toEqual({ x: 10, y: 8 })
  })
  it('a skewed box needs straightening', () => {
    const q: Quad = [{ x: 0, y: 0 }, { x: 100, y: 8 }, { x: 96, y: 100 }, { x: 4, y: 95 }]
    expect(isSquareOn(q)).toBe(false)
  })
  it('a tiny finger wobble is still square-on', () => {
    const q: Quad = [{ x: 0, y: 0 }, { x: 100, y: 1 }, { x: 100.5, y: 100 }, { x: 0, y: 100.5 }]
    expect(isSquareOn(q)).toBe(true)
  })
})
