// A synthetic practice strip drawn from simple wave shapes. It is not a patient
// recording. Paper 25 mm/s, 10 mm/mV, drawn at PX_PER_MM.

export const DEMO_PX_PER_MM = 8
const MM = DEMO_PX_PER_MM
const ROW_H = 30 // mm per row
const WIDTH = 250 // mm
const RR = 0.8 // s, 75/min

interface Shape { p: number; q: number; r: number; s: number; t: number; st: number }
const ROWS: { label: string; shape: Shape }[] = [
  { label: 'I', shape: { p: 0.1, q: -0.06, r: 0.8, s: -0.2, t: 0.25, st: 0 } },
  { label: 'aVF', shape: { p: 0.1, q: -0.04, r: 0.6, s: -0.1, t: 0.2, st: 0 } },
  { label: 'V2', shape: { p: 0.08, q: 0, r: 0.4, s: -1.2, t: 0.5, st: 0.2 } },
  { label: 'II', shape: { p: 0.15, q: -0.08, r: 1.0, s: -0.15, t: 0.3, st: 0 } },
]

const g = (t: number, mu: number, sd: number) => Math.exp(-0.5 * ((t - mu) / sd) ** 2)

/** Voltage (mV) at time t seconds into one beat, with the QRS onset at 0.16 s. */
function beat(t: number, s: Shape): number {
  const qrs = 0.16
  let v = s.p * g(t, 0.07, 0.022) // P wave, PR about 160 ms
  v += s.q * g(t, qrs + 0.012, 0.007)
  v += s.r * g(t, qrs + 0.04, 0.011)
  v += s.s * g(t, qrs + 0.07, 0.01)
  // ST shift from the J point (~qrs + 90 ms) blending into the T wave.
  const j = qrs + 0.09
  if (s.st) v += s.st * (1 / (1 + Math.exp(-(t - j) / 0.006))) * (1 / (1 + Math.exp((t - (qrs + 0.36)) / 0.02)))
  v += s.t * g(t, qrs + 0.28, 0.045) // T wave; QT about 380 ms
  return v
}

export function drawDemo(): Promise<{ src: string; w: number; h: number }> {
  const w = WIDTH * MM, h = ROWS.length * ROW_H * MM
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const x = c.getContext('2d')!
  x.fillStyle = '#fff8f6'; x.fillRect(0, 0, w, h)
  for (let mm = 0; mm <= Math.max(WIDTH, ROWS.length * ROW_H); mm++) {
    x.strokeStyle = mm % 5 === 0 ? '#f0a3a3' : '#fadada'
    x.lineWidth = mm % 5 === 0 ? 1.4 : 0.8
    if (mm <= WIDTH) { x.beginPath(); x.moveTo(mm * MM, 0); x.lineTo(mm * MM, h); x.stroke() }
    if (mm <= ROWS.length * ROW_H) { x.beginPath(); x.moveTo(0, mm * MM); x.lineTo(w, mm * MM); x.stroke() }
  }
  x.strokeStyle = '#111'; x.lineWidth = 2; x.lineJoin = 'round'
  ROWS.forEach((row, i) => {
    const base = (i * ROW_H + 20) * MM
    // 1 mV calibration pulse, 200 ms wide.
    x.beginPath(); x.moveTo(2 * MM, base); x.lineTo(4 * MM, base); x.lineTo(4 * MM, base - 10 * MM)
    x.lineTo(9 * MM, base - 10 * MM); x.lineTo(9 * MM, base); x.lineTo(12 * MM, base); x.stroke()
    x.beginPath()
    for (let px = 12 * MM; px < w; px++) {
      const t = ((px / MM - 12) / 25) + 0.3 // seconds; offset so the strip starts mid-diastole
      const v = beat(((t % RR) + RR) % RR, row.shape)
      const y = base - v * 10 * MM
      if (px === 12 * MM) x.moveTo(px, y); else x.lineTo(px, y)
    }
    x.stroke()
    x.fillStyle = '#111'; x.font = `bold ${4 * MM}px system-ui, sans-serif`
    x.fillText(row.label, 2 * MM, (i * ROW_H + 6) * MM)
  })
  x.fillStyle = '#6b7280'; x.font = `${3 * MM}px system-ui, sans-serif`
  x.fillText('Practice strip (synthetic) · 25 mm/s · 10 mm/mV', 30 * MM, 4 * MM)
  return new Promise(r => c.toBlob(b => r({ src: URL.createObjectURL(b!), w, h }), 'image/png'))
}
