import type { PointerEvent as RPointerEvent } from 'react'
import type { Point } from '../lib/measure'
import type { Quad } from '../lib/calbox'
import { stDeviationMm, heightMm, netQrsMm, type Lead } from '../lib/leads'

export interface Caliper {
  id: number
  kind: 'time' | 'amp'
  type: string
  a: Point
  b: Point
  beats: number
  march: boolean
}

export interface Marker { id: number; kind: 'ste' | 'axis'; lead: Lead; pts: Point[] }

export const COLORS: Record<string, string> = {
  'R-R': '#2563eb', PR: '#7c3aed', QRS: '#db2777', QT: '#ea580c', 'P wave': '#059669',
  'P amp': '#059669', 'R amp': '#db2777', 'S amp': '#0891b2', Other: '#475569',
}

type Down = (e: RPointerEvent, id: number, leg: 'a' | 'b' | 'bar') => void

/**
 * A time caliper is a translucent band between its legs, coloured by interval
 * type. March out repeats the band across the strip so each beat can be checked.
 */
export function CaliperShape({ c, hs, w, h, selected, label, onDown }: {
  c: Caliper; hs: number; w: number; h: number; selected: boolean; label: string; onDown: Down
}) {
  const col = COLORS[c.type] ?? COLORS.Other
  const sw = (selected ? 2.5 : 1.5) * hs
  const grab = 24 * hs
  if (c.kind === 'time') {
    const y = c.a.y
    const x0 = Math.min(c.a.x, c.b.x), span = Math.abs(c.b.x - c.a.x)
    const bands: number[] = []
    if (c.march && span > 2 * hs) {
      for (let x = x0 + span; x < w; x += span) bands.push(x)
      for (let x = x0 - span; x + span > 0; x -= span) bands.push(x)
    }
    return (
      <g>
        {bands.map((x, i) => (
          <g key={i}>
            <rect x={x} y={0} width={span} height={h} fill={col} opacity={i % 2 ? 0.07 : 0.11} />
            <line x1={x} x2={x} y1={0} y2={h} stroke={col} strokeWidth={hs} strokeDasharray={`${6 * hs} ${5 * hs}`} opacity={0.6} />
          </g>
        ))}
        <rect x={x0} y={0} width={span} height={h} fill={col} opacity={selected ? 0.22 : 0.16} />
        <line x1={c.a.x} x2={c.a.x} y1={0} y2={h} stroke={col} strokeWidth={sw} />
        <line x1={c.b.x} x2={c.b.x} y1={0} y2={h} stroke={col} strokeWidth={sw} />
        <line x1={c.a.x} x2={c.b.x} y1={y} y2={y} stroke={col} strokeWidth={sw} />
        <line x1={c.a.x} x2={c.b.x} y1={y} y2={y} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'bar')} className="grab" />
        <line x1={c.a.x} x2={c.a.x} y1={0} y2={h} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'a')} className="grab ew" />
        <line x1={c.b.x} x2={c.b.x} y1={0} y2={h} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'b')} className="grab ew" />
        <circle cx={c.a.x} cy={y} r={7 * hs} fill={col} />
        <circle cx={c.b.x} cy={y} r={7 * hs} fill={col} />
        <Tag x={(c.a.x + c.b.x) / 2} y={y - 14 * hs} hs={hs} text={label} col={col} />
      </g>
    )
  }
  const x = c.a.x
  const y0 = Math.min(c.a.y, c.b.y), hh = Math.abs(c.b.y - c.a.y)
  return (
    <g>
      <rect x={0} y={y0} width={w} height={hh} fill={col} opacity={selected ? 0.16 : 0.1} />
      <line x1={0} x2={w} y1={c.a.y} y2={c.a.y} stroke={col} strokeWidth={sw} />
      <line x1={0} x2={w} y1={c.b.y} y2={c.b.y} stroke={col} strokeWidth={sw} />
      <line x1={x} x2={x} y1={c.a.y} y2={c.b.y} stroke={col} strokeWidth={sw} />
      <line x1={x} x2={x} y1={c.a.y} y2={c.b.y} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'bar')} className="grab" />
      <line x1={0} x2={w} y1={c.a.y} y2={c.a.y} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'a')} className="grab ns" />
      <line x1={0} x2={w} y1={c.b.y} y2={c.b.y} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'b')} className="grab ns" />
      <circle cx={x} cy={c.a.y} r={7 * hs} fill={col} />
      <circle cx={x} cy={c.b.y} r={7 * hs} fill={col} />
      <Tag x={x + 12 * hs} y={(c.a.y + c.b.y) / 2} hs={hs} text={label} col={col} anchor="start" />
    </g>
  )
}

export function MarkerShape({ m, hs, pxPerMmY, selected, onDown }: {
  m: Marker; hs: number; pxPerMmY: number; selected: boolean
  onDown: (e: RPointerEvent, id: number, idx: number) => void
}) {
  const col = m.kind === 'ste' ? '#dc2626' : '#0d9488'
  const [base, p1, p2] = m.pts
  const mm = pxPerMmY
  const halfW = 40 * mm
  const sw = (selected ? 2.25 : 1.5) * hs
  const dots = m.pts.map((p, i) => (
    <g key={i}>
      <circle cx={p.x} cy={p.y} r={5 * hs} fill={i === 0 ? '#fff' : col} stroke={col} strokeWidth={2 * hs} />
      <circle cx={p.x} cy={p.y} r={20 * hs} fill="transparent" className="grab" onPointerDown={e => onDown(e, m.id, i)} />
    </g>
  ))
  if (m.kind === 'axis') {
    const net = netQrsMm(base, p1, p2, pxPerMmY)
    return (
      <g>
        <line x1={base.x - halfW / 2} x2={base.x + halfW / 2} y1={base.y} y2={base.y} stroke={col} strokeWidth={sw} strokeDasharray={`${6 * hs} ${4 * hs}`} />
        {dots}
        <Tag x={p1.x + 12 * hs} y={p1.y} hs={hs} col={col} anchor="start" text={`${m.lead} net ${net >= 0 ? '+' : ''}${net.toFixed(1)} mm`} />
      </g>
    )
  }
  const st = stDeviationMm(base, p1, pxPerMmY)
  const q = p2 && (p2.x !== p1.x || p2.y !== p1.y) ? heightMm(base, p2, pxPerMmY) : null
  const n = Math.max(3, Math.ceil(Math.abs(st)) + 2)
  const ticks = []
  for (let i = -n; i <= n; i++) {
    const y = base.y - i * mm
    const len = (i % 5 === 0 ? 4 : 2) * mm
    ticks.push(<line key={i} x1={p1.x - len} x2={p1.x} y1={y} y2={y} stroke={col} strokeWidth={(i === 0 ? 1.5 : 1) * hs} />)
  }
  return (
    <g>
      <line x1={p1.x - halfW} x2={p1.x + halfW} y1={base.y} y2={base.y} stroke={col} strokeWidth={sw} strokeDasharray={`${6 * hs} ${4 * hs}`} />
      {Math.abs(st) > 0.05 && <rect x={p1.x} y={Math.min(base.y, p1.y)} width={10 * mm} height={Math.abs(p1.y - base.y)} fill={col} opacity={0.18} />}
      <line x1={p1.x} x2={p1.x + 10 * mm} y1={p1.y} y2={p1.y} stroke={col} strokeWidth={sw} />
      <line x1={p1.x} x2={p1.x} y1={base.y - n * mm} y2={base.y + n * mm} stroke={col} strokeWidth={hs} />
      {ticks}
      {dots}
      <Tag x={p1.x + 12 * hs} y={p1.y - 12 * hs} hs={hs} col={col} anchor="start"
        text={`${m.lead} ST ${st >= 0 ? '+' : '−'}${Math.abs(st).toFixed(1)} mm${q ? ` · ${(Math.abs(st) / q).toFixed(2)} of QRS` : ''}`} />
    </g>
  )
}

/** The calibration box: drag the corners onto a grid square, or drag inside to move it. */
export function CalBoxShape({ q, hs, onCorner, onMove }: {
  q: Quad; hs: number
  onCorner: (e: RPointerEvent, i: number) => void
  onMove: (e: RPointerEvent) => void
}) {
  const pts = q.map(p => `${p.x},${p.y}`).join(' ')
  return (
    <g>
      <polygon points={pts} fill="#facc15" opacity={0.22} />
      <polygon points={pts} fill="transparent" stroke="#ca8a04" strokeWidth={2 * hs} className="grab" onPointerDown={onMove} />
      {q.map((p, i) => (
        <g key={i}>
          <line x1={p.x - 14 * hs} x2={p.x + 14 * hs} y1={p.y} y2={p.y} stroke="#a16207" strokeWidth={1.25 * hs} />
          <line x1={p.x} x2={p.x} y1={p.y - 14 * hs} y2={p.y + 14 * hs} stroke="#a16207" strokeWidth={1.25 * hs} />
          <circle cx={p.x} cy={p.y} r={9 * hs} fill="none" stroke="#a16207" strokeWidth={2 * hs} />
          <circle cx={p.x} cy={p.y} r={24 * hs} fill="transparent" className="grab" onPointerDown={e => onCorner(e, i)} />
        </g>
      ))}
    </g>
  )
}

export function Tag({ x, y, hs, text, col, anchor = 'middle' }: { x: number; y: number; hs: number; text: string; col: string; anchor?: 'middle' | 'start' }) {
  const fs = 14 * hs
  const wpx = text.length * fs * 0.6 + 10 * hs
  const left = anchor === 'middle' ? x - wpx / 2 : x
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - fs} width={wpx} height={fs * 1.4} rx={4 * hs} fill="white" stroke={col} strokeWidth={hs} />
      <text x={left + wpx / 2} y={y} fontSize={fs} textAnchor="middle" fill={col} fontWeight={600}>{text}</text>
    </g>
  )
}

/** A small PQRST sketch that highlights the point the user should tap next. */
export function StepDiagram({ kind, step }: { kind: 'ste' | 'axis'; step: number }) {
  const targets = kind === 'ste'
    ? [{ x: 12, y: 46, l: 'baseline' }, { x: 70, y: 38, l: 'J' }, { x: 58, y: 8, l: 'QRS peak' }]
    : [{ x: 12, y: 46, l: 'baseline' }, { x: 58, y: 8, l: 'R' }, { x: 65, y: 63, l: 'S' }]
  const trace = kind === 'ste'
    ? 'M0 46 L20 46 Q28 36 36 46 L48 46 L52 51 L58 8 L65 63 L70 38 Q86 34 96 26 Q106 18 116 40 L124 46 L160 46'
    : 'M0 46 L20 46 Q28 36 36 46 L48 46 L52 51 L58 8 L65 63 L70 46 L90 46 Q102 30 114 46 L160 46'
  return (
    <svg viewBox="0 0 160 70" className="diagram" aria-hidden>
      <line x1={0} x2={160} y1={46} y2={46} stroke="currentColor" opacity={0.2} strokeDasharray="3 3" />
      <path d={trace} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      {targets.map((t, i) => (
        <g key={i} opacity={i > step ? 0.25 : 1}>
          <circle cx={t.x} cy={t.y} r={i === step ? 6 : 4} fill={i < step ? '#16a34a' : i === step ? '#dc2626' : 'currentColor'} />
          {i === step && <circle cx={t.x} cy={t.y} r={10} fill="none" stroke="#dc2626" strokeWidth={1.5} className="pulse" />}
        </g>
      ))}
    </svg>
  )
}
