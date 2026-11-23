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
  /** A set band stays on the strip as a record of one measurement. */
  band: boolean
}

export interface Marker { id: number; kind: 'ste' | 'axis' | 'pq' | 'qrs' | 'pp' | 'rr'; lead: Lead; pts: Point[]; roles?: string[] }

/** Tapped P or R waves with the first interval marched out across the strip, and each interval labelled. */
function SeriesShape({ m, hs, mm, w, selected, st, onDown }: {
  m: Marker; hs: number; mm: number; w: number; selected: boolean
  st?: { intervals: number[]; deviation: number[] } | null
  onDown: (e: RPointerEvent, id: number, idx: number | 'all') => void
}) {
  const col = m.kind === 'pp' ? '#059669' : '#2563eb'
  const y0 = m.pts.reduce((a, p) => a + p.y, 0) / m.pts.length
  // P marks sit above the row, R marks below, so both series in one lead stay readable.
  const off = m.kind === 'pp' ? -1 : 1
  const top = y0 - 12 * mm, bot = y0 + 12 * mm
  const xs = m.pts.map(p => p.x)
  const ticks: number[] = []
  if (xs.length >= 2 && xs[1] - xs[0] > 2 * hs) {
    const step = xs[1] - xs[0]
    for (let x = xs[0] + step; x < w; x += step) ticks.push(x)
    for (let x = xs[0] - step; x > 0; x -= step) ticks.push(x)
  }
  const fs = 11 * hs
  const ly = off < 0 ? top - 6 * hs : bot + 14 * hs
  return (
    <g>
      {ticks.map((x, i) => (
        <g key={`t${i}`} pointerEvents="none">
          <line x1={x} x2={x} y1={top} y2={bot} stroke={col} strokeWidth={1.25 * hs} strokeDasharray={`${5 * hs} ${4 * hs}`} opacity={0.75} />
          <path d={`M${x - 5 * hs} ${off < 0 ? top - 6 * hs : bot + 6 * hs} L${x + 5 * hs} ${off < 0 ? top - 6 * hs : bot + 6 * hs} L${x} ${off < 0 ? top : bot} Z`} fill={col} opacity={0.75} />
        </g>
      ))}
      {m.pts.map((p, i) => (
        <g key={i}>
          <line x1={p.x} x2={p.x} y1={off < 0 ? top : y0} y2={off < 0 ? y0 : bot} stroke={col} strokeWidth={(selected ? 2.5 : 2) * hs} />
          <circle cx={p.x} cy={p.y} r={4.5 * hs} fill={col} />
          <text x={p.x} y={off < 0 ? top - 9 * hs : bot + 26 * hs} fontSize={fs} textAnchor="middle" fill={col} fontWeight={700} pointerEvents="none">{m.kind === 'pp' ? 'P' : 'R'}</text>
          {st && i > 0 && Math.abs(st.deviation[i]) >= 1 && (
            <text x={p.x + 4 * hs} y={y0 + off * 6 * mm} fontSize={fs} fill={col} pointerEvents="none">{st.deviation[i] > 0 ? '+' : '−'}{Math.round(Math.abs(st.deviation[i]))}</text>
          )}
          {m.id >= 0 && <line x1={p.x} x2={p.x} y1={top} y2={bot} stroke="transparent" strokeWidth={20 * hs} className="grab ew" onPointerDown={e => onDown(e, m.id, i)} />}
        </g>
      ))}
      {st && m.pts.slice(1).map((p, i) => (
        <text key={`iv${i}`} x={(p.x + m.pts[i].x) / 2} y={ly} fontSize={fs} textAnchor="middle" fill="#334155" fontWeight={600} pointerEvents="none">{Math.round(st.intervals[i])}</text>
      ))}
      {m.id >= 0 && <>
        <Tag x={xs[0]} y={off < 0 ? top - 26 * hs : bot + 46 * hs} hs={hs} col={col} text={`${m.lead} ${m.kind === 'pp' ? 'P-P' : 'R-R'}`} />
        <rect x={xs[0] - 36 * hs} y={(off < 0 ? top - 26 * hs : bot + 46 * hs) - 20 * hs} width={72 * hs} height={26 * hs} fill="transparent" className="grab" onPointerDown={e => onDown(e, m.id, 'all')} />
      </>}
    </g>
  )
}

const ROLE_COLOR: Record<string, string> = {
  'P onset': '#059669', 'P end': '#059669', 'QRS onset': '#db2777', 'R peak': '#7c3aed', 'S nadir': '#0891b2', 'QRS end': '#db2777', Notch: '#ea580c',
}
const ROLE_SHORT: Record<string, string> = { 'P onset': 'P↑', 'P end': 'P↓', 'QRS onset': 'Q↑', 'R peak': 'R', 'S nadir': 'S', 'QRS end': 'J', Notch: 'n' }

/** Vertical marks the user placed within one complex, with the intervals between them bracketed underneath. */
function MarksShape({ m, hs, mm, selected, intervals, onDown }: {
  m: Marker; hs: number; mm: number; selected: boolean
  intervals: { label: string; ms: number; key: string }[]
  onDown: (e: RPointerEvent, id: number, idx: number | 'all') => void
}) {
  const roles = m.roles ?? []
  const y0 = m.pts.reduce((a, p) => a + p.y, 0) / m.pts.length
  const top = y0 - 12 * mm, bot = y0 + 12 * mm
  const x = (r: string) => { const i = roles.indexOf(r); return i < 0 ? null : m.pts[i].x }
  const shade = (a: string, b: string, col: string, op: number) => {
    const xa = x(a), xb = x(b)
    return xa != null && xb != null ? <rect x={Math.min(xa, xb)} y={top} width={Math.abs(xb - xa)} height={bot - top} fill={col} opacity={op} /> : null
  }
  const spans: Record<string, [string, string]> = {
    pDur: ['P onset', 'P end'], pr: ['P onset', 'QRS onset'], prSeg: ['P end', 'QRS onset'],
    qrs: ['QRS onset', 'QRS end'], rwat: ['QRS onset', 'R peak'], rs: ['QRS onset', 'S nadir'],
  }
  const xs = m.pts.map(p => p.x)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const fs = 11 * hs
  return (
    <g>
      {m.kind === 'pq' ? <>{shade('P onset', 'P end', '#059669', 0.22)}{shade('P end', 'QRS onset', '#7c3aed', 0.12)}</>
        : <>{shade('QRS onset', 'QRS end', '#db2777', selected ? 0.2 : 0.14)}</>}
      {m.pts.map((p, i) => {
        const col = ROLE_COLOR[roles[i]] ?? '#475569'
        return (
          <g key={i}>
            <line x1={p.x} x2={p.x} y1={top} y2={bot} stroke={col} strokeWidth={(selected ? 2 : 1.4) * hs} strokeDasharray={roles[i] === 'Notch' ? `${4 * hs} ${3 * hs}` : undefined} />
            <circle cx={p.x} cy={p.y} r={3.5 * hs} fill={col} />
            <text x={p.x} y={top - 3 * hs} fontSize={fs} textAnchor="middle" fill={col} fontWeight={700} pointerEvents="none">{ROLE_SHORT[roles[i]] ?? ''}</text>
            <line x1={p.x} x2={p.x} y1={top} y2={bot} stroke="transparent" strokeWidth={22 * hs} className="grab ew" onPointerDown={e => onDown(e, m.id, i)} />
          </g>
        )
      })}
      {intervals.filter(iv => spans[iv.key]).map((iv, k) => {
        const [a, b] = spans[iv.key]
        const xa = x(a)!, xb = x(b)!
        const y = bot + (5 + k * 5) * mm * 0.8
        return (
          <g key={iv.key} pointerEvents="none">
            <line x1={xa} x2={xb} y1={y} y2={y} stroke="#334155" strokeWidth={1.2 * hs} />
            <line x1={xa} x2={xa} y1={y - 3 * hs} y2={y + 3 * hs} stroke="#334155" strokeWidth={1.2 * hs} />
            <line x1={xb} x2={xb} y1={y - 3 * hs} y2={y + 3 * hs} stroke="#334155" strokeWidth={1.2 * hs} />
            <text x={Math.max(xa, xb) + 4 * hs} y={y + 4 * hs} fontSize={fs} fill="#334155" fontWeight={600}>{iv.label} {Math.round(iv.ms)}</text>
          </g>
        )
      })}
      <Tag x={cx} y={top - 18 * hs} hs={hs} col={m.kind === 'pq' ? '#059669' : '#db2777'} text={`${m.lead} ${m.kind === 'pq' ? 'P→QRS' : 'QRS'}`} />
      <rect x={cx - 40 * hs} y={top - 38 * hs} width={80 * hs} height={26 * hs} fill="transparent" className="grab" onPointerDown={e => onDown(e, m.id, 'all')} />
    </g>
  )
}

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
  if (c.kind === 'time' && c.band) {
    const x0 = Math.min(c.a.x, c.b.x), span = Math.abs(c.b.x - c.a.x)
    const bands: number[] = []
    if (c.march && span > 2 * hs) {
      for (let x = x0 + span; x < w; x += span) bands.push(x)
      for (let x = x0 - span; x + span > 0; x -= span) bands.push(x)
    }
    const y = c.a.y
    return (
      <g>
        {bands.map((x, i) => (
          <g key={i}>
            <rect x={x} y={0} width={span} height={h} fill={col} opacity={0.1} />
            <line x1={x} x2={x} y1={0} y2={h} stroke={col} strokeWidth={hs} strokeDasharray={`${6 * hs} ${5 * hs}`} opacity={0.6} />
          </g>
        ))}
        <rect x={x0} y={0} width={span} height={h} fill={col} opacity={selected ? 0.3 : 0.2} />
        <line x1={x0} x2={x0} y1={0} y2={h} stroke={col} strokeWidth={(selected ? 2 : 1) * hs} opacity={0.8} />
        <line x1={x0 + span} x2={x0 + span} y1={0} y2={h} stroke={col} strokeWidth={(selected ? 2 : 1) * hs} opacity={0.8} />
        {selected && <>
          {/* Selected: drag inside the column to move it, or an edge to resize. */}
          <rect x={x0} y={0} width={span} height={h} fill="transparent" className="grab ew" onPointerDown={e => onDown(e, c.id, 'bar')} />
          <line x1={c.a.x} x2={c.a.x} y1={0} y2={h} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'a')} className="grab ew" />
          <line x1={c.b.x} x2={c.b.x} y1={0} y2={h} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'b')} className="grab ew" />
        </>}
        <Tag x={x0 + span / 2} y={y - 14 * hs} hs={hs} text={label} col={col} />
        {/* The label is the band's handle while unselected, so panning over bands still works. */}
        <rect x={x0 + span / 2 - 40 * hs} y={y - 34 * hs} width={80 * hs} height={36 * hs} fill="transparent" className="grab" onPointerDown={e => onDown(e, c.id, 'bar')} />
      </g>
    )
  }
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
        <rect x={x0} y={0} width={span} height={h} fill={col} opacity={0.1} />
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

export function MarkerShape({ m, hs, pxPerMmY, selected, onDown, intervals, series, w }: {
  m: Marker; hs: number; pxPerMmY: number; selected: boolean
  onDown: (e: RPointerEvent, id: number, idx: number | 'all') => void
  intervals?: { label: string; ms: number; key: string }[]
  series?: { intervals: number[]; deviation: number[] } | null
  w?: number
  live?: boolean | null
}) {
  if (m.kind === 'pp' || m.kind === 'rr') return <SeriesShape m={m} hs={hs} mm={pxPerMmY} w={w ?? 0} selected={selected} st={series} onDown={onDown} />
  if (m.kind === 'pq' || m.kind === 'qrs') return <MarksShape m={m} hs={hs} mm={pxPerMmY} selected={selected} intervals={intervals ?? []} onDown={onDown} />
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
