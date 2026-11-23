import type { Point } from './measure'

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point]

const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * True when the box is close enough to an axis-aligned rectangle that the
 * photo needs no straightening: every side within 2 degrees of the axes and
 * opposite sides within 3% of each other.
 */
export function isSquareOn(q: Quad): boolean {
  const [tl, tr, br, bl] = q
  const ang = (a: Point, b: Point, horiz: boolean) => {
    const dx = b.x - a.x, dy = b.y - a.y
    return Math.abs(Math.atan2(horiz ? dy : dx, horiz ? dx : dy)) * 180 / Math.PI
  }
  const tilt = Math.max(ang(tl, tr, true), ang(bl, br, true), ang(tl, bl, false), ang(tr, br, false))
  const w1 = d(tl, tr), w2 = d(bl, br), h1 = d(tl, bl), h2 = d(tr, br)
  const skew = Math.max(Math.abs(w1 - w2) / Math.max(w1, w2), Math.abs(h1 - h2) / Math.max(h1, h2))
  return tilt <= 2 && skew <= 0.03
}

/** Pixels per mm on each axis from a box spanning wMm x hMm. */
export function scaleFromBox(q: Quad, wMm: number, hMm: number): { x: number; y: number } {
  const [tl, tr, br, bl] = q
  return { x: (d(tl, tr) + d(bl, br)) / 2 / wMm, y: (d(tl, bl) + d(tr, br)) / 2 / hMm }
}

export function squareAt(c: Point, half: number): Quad {
  return [{ x: c.x - half, y: c.y - half }, { x: c.x + half, y: c.y - half }, { x: c.x + half, y: c.y + half }, { x: c.x - half, y: c.y + half }]
}
