import { describe, it, expect } from 'vitest'
import { solveHomography, apply, invert, orderCorners } from './homography'

const src = [{ x: 110, y: 95 }, { x: 520, y: 130 }, { x: 540, y: 410 }, { x: 90, y: 380 }]
const dst = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 300 }, { x: 0, y: 300 }]

describe('homography', () => {
  it('maps the four corners exactly', () => {
    const h = solveHomography(src, dst)
    src.forEach((p, i) => {
      const q = apply(h, p)
      expect(q.x).toBeCloseTo(dst[i].x, 6)
      expect(q.y).toBeCloseTo(dst[i].y, 6)
    })
  })
  it('inverse round-trips', () => {
    const h = solveHomography(src, dst), hi = invert(h)
    const p = { x: 250, y: 260 }
    const q = apply(hi, apply(h, p))
    expect(q.x).toBeCloseTo(p.x, 6); expect(q.y).toBeCloseTo(p.y, 6)
  })
  it('rejects collinear corners', () => {
    expect(() => solveHomography([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], dst)).toThrow()
  })
  it('orders taps in any order', () => {
    const shuffled = [src[2], src[0], src[3], src[1]]
    expect(orderCorners(shuffled)).toEqual(src)
  })
})
