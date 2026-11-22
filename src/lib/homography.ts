import type { Point } from './measure'

/** 3x3 matrix in row-major order. */
export type H = [number, number, number, number, number, number, number, number, number]

/** Homography mapping src[i] -> dst[i] for four point pairs (DLT, h33 = 1). */
export function solveHomography(src: Point[], dst: Point[]): H {
  if (src.length !== 4 || dst.length !== 4) throw new Error('Need four point pairs')
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let c = 0; c < 8; c++) {
    let piv = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
    if (Math.abs(A[piv][c]) < 1e-12) throw new Error('Those four corners are in a line; tap the corners of a rectangle')
    ;[A[c], A[piv]] = [A[piv], A[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  const h = A.map((row, i) => row[8] / row[i])
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

export function apply(h: H, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8]
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w }
}

export function invert(h: H): H {
  const [a, b, c, d, e, f, g, i, j] = h
  const A = e * j - f * i, B = -(d * j - f * g), C = d * i - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) throw new Error('Cannot invert')
  const m: H = [A, -(b * j - c * i), b * f - c * e, B, a * j - c * g, -(a * f - c * d), C, -(a * i - b * g), a * e - b * d]
  return m.map(v => v / det / (m[8] / det)) as H
}

/** Orders four tapped points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts: Point[]): Point[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4
  const byAngle = [...pts].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx))
  // atan2 order starting from -pi: top-left first in image coordinates (y down).
  let start = 0, best = Infinity
  byAngle.forEach((p, i) => { if (p.x + p.y < best) { best = p.x + p.y; start = i } })
  return [0, 1, 2, 3].map(k => byAngle[(start + k) % 4])
}
