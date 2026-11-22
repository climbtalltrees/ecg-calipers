import type { Point } from './measure'
import { solveHomography, apply, invert, orderCorners } from './homography'

export interface Warped { src: string; w: number; h: number; pxPerMm: number }

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}

const MAX_PIXELS = 12_000_000

/**
 * Straightens a photo so the tapped grid rectangle (wMm x hMm) becomes a true
 * rectangle with square millimetres. Returns the new image and its exact scale,
 * which sets both calibration axes at once.
 */
export async function straighten(imageSrc: string, taps: Point[], wMm: number, hMm: number): Promise<Warped> {
  const img = await loadImg(imageSrc)
  const [tl, tr, br, bl] = orderCorners(taps)
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  let k = ((d(tl, tr) + d(bl, br)) / (2 * wMm) + (d(tl, bl) + d(tr, br)) / (2 * hMm)) / 2
  const rect = (s: number) => [{ x: 0, y: 0 }, { x: wMm * s, y: 0 }, { x: wMm * s, y: hMm * s }, { x: 0, y: hMm * s }]
  let H = solveHomography([tl, tr, br, bl], rect(k))

  // Output covers the whole photo, clamped so a steep angle can't explode the size.
  const corners = [{ x: 0, y: 0 }, { x: img.naturalWidth, y: 0 }, { x: img.naturalWidth, y: img.naturalHeight }, { x: 0, y: img.naturalHeight }]
  const bounds = (h: typeof H, s: number) => {
    const ps = corners.map(c => apply(h, c))
    const lim = 4 * Math.max(wMm, hMm) * s
    const xs = ps.map(p => Math.max(-lim, Math.min(wMm * s + lim, p.x)))
    const ys = ps.map(p => Math.max(-lim, Math.min(hMm * s + lim, p.y)))
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  }
  let b = bounds(H, k)
  const area = (b.x1 - b.x0) * (b.y1 - b.y0)
  if (area > MAX_PIXELS) {
    k *= Math.sqrt(MAX_PIXELS / area)
    H = solveHomography([tl, tr, br, bl], rect(k))
    b = bounds(H, k)
  }
  const W = Math.ceil(b.x1 - b.x0), Hh = Math.ceil(b.y1 - b.y0)

  const sc = document.createElement('canvas')
  sc.width = img.naturalWidth; sc.height = img.naturalHeight
  const sctx = sc.getContext('2d')!
  sctx.drawImage(img, 0, 0)
  const sd = sctx.getImageData(0, 0, sc.width, sc.height).data
  const out = document.createElement('canvas')
  out.width = W; out.height = Hh
  const octx = out.getContext('2d')!
  const od = octx.createImageData(W, Hh)
  const inv = invert(H)
  const sw = sc.width, sh = sc.height
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const p = apply(inv, { x: x + b.x0, y: y + b.y0 })
      const o = (y * W + x) * 4
      if (!(p.x >= 0 && p.y >= 0 && p.x < sw - 1 && p.y < sh - 1)) { od.data[o] = od.data[o + 1] = od.data[o + 2] = 40; od.data[o + 3] = 255; continue }
      // Bilinear sampling keeps thin grid lines and traces crisp.
      const x0 = Math.floor(p.x), y0 = Math.floor(p.y), fx = p.x - x0, fy = p.y - y0
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4
      for (let c = 0; c < 3; c++) {
        od.data[o + c] = (sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx) * (1 - fy) + (sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx) * fy
      }
      od.data[o + 3] = 255
    }
  }
  octx.putImageData(od, 0, 0)
  const blob: Blob = await new Promise(r => out.toBlob(b => r(b!), 'image/png'))
  return { src: URL.createObjectURL(blob), w: W, h: Hh, pxPerMm: k }
}
