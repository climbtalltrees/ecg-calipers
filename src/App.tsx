import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { loadFile, type LoadedImage } from './lib/loadImage'
import { straighten } from './lib/warp'
import { exportView } from './lib/exportView'
import {
  pxPerMm, pxToMs, pxToMv, rateFromSpan, qtcBazett, qtcFridericia,
  type Calibration, type Point,
} from './lib/measure'
import { qrsFlag, qtcFlag, stFlag, axisFlag, type Flag, type Patient } from './lib/flags'
import { REFS, RULES } from './lib/references'
import { LEADS, stDeviationMm, heightMm, netQrsMm, frontalAxis, type Lead } from './lib/leads'

type TimeType = 'R-R' | 'PR' | 'QRS' | 'QT' | 'P wave' | 'Other'
type AmpType = 'P amp' | 'R amp' | 'S amp' | 'Other'
const TIME_TYPES: TimeType[] = ['R-R', 'PR', 'QRS', 'QT', 'P wave', 'Other']
const AMP_TYPES: AmpType[] = ['P amp', 'R amp', 'S amp', 'Other']

interface Caliper {
  id: number
  kind: 'time' | 'amp'
  type: string
  a: Point // first leg
  b: Point // second leg
  beats: number // R-R only: how many intervals the span covers
  march: boolean
}

/** User-tapped points on one lead. STE: base, j, peak?. Axis: base, r, s. */
interface Marker {
  id: number
  kind: 'ste' | 'axis'
  lead: Lead
  pts: Point[]
}
type Placing = null | { kind: 'ste' | 'axis'; lead: Lead | null; pts: Point[] }
const STEPS: Record<'ste' | 'axis', string[]> = {
  ste: ['the baseline (TP or PR segment)', 'the J point', 'the tallest point of the QRS (for the ST:QRS ratio)'],
  axis: ['the baseline', 'the top of the R wave', 'the bottom of the S wave'],
}
const AXIS_LEADS: Lead[] = ['I', 'aVF', 'II']

type CalStep = null | { axis: 'x' | 'y' | 'quad'; pts: Point[] }
interface View { s: number; tx: number; ty: number }

const COLORS: Record<string, string> = {
  'R-R': '#2563eb', PR: '#7c3aed', QRS: '#db2777', QT: '#ea580c', 'P wave': '#059669',
  'P amp': '#059669', 'R amp': '#db2777', 'S amp': '#0891b2', Other: '#475569',
}

let nextId = 1

export default function App() {
  const [img, setImg] = useState<LoadedImage | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 })
  const [cal, setCal] = useState<Partial<Calibration>>({ paperSpeedMmPerS: 25, gainMmPerMv: 10 })
  const [calStep, setCalStep] = useState<CalStep>(null)
  const [calPrompt, setCalPrompt] = useState<null | { axis: 'x' | 'y'; pts: Point[] }>(null)
  const [calChoice, setCalChoice] = useState(false)
  const [quadPrompt, setQuadPrompt] = useState<Point[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [calipers, setCalipers] = useState<Caliper[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [sheet, setSheet] = useState(false)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [placing, setPlacing] = useState<Placing>(null)
  const [selMarker, setSelMarker] = useState<number | null>(null)
  const [patient, setPatient] = useState<Patient>({ sex: 'unset', age: 'unset' })

  const vpRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startView: View; start: Map<number, { x: number; y: number }>; downAt: { x: number; y: number }; moved: boolean } | null>(null)
  const drag = useRef<{ id: number; leg: 'a' | 'b' | 'bar'; last: Point } | { marker: number; idx: number; last: Point } | null>(null)

  const calibratedX = !!cal.pxPerMmX
  const calibratedY = !!cal.pxPerMmY
  const fullCal = cal as Calibration

  // ---------- loading ----------
  const onFile = async (file?: File) => {
    if (!file) return
    setErr(null)
    try {
      const loaded = await loadFile(file)
      setImg(loaded)
      setCalipers([])
      setMarkers([])
      setPlacing(null)
      setCal(c => ({ paperSpeedMmPerS: c.paperSpeedMmPerS, gainMmPerMv: c.gainMmPerMv }))
      setCalStep(null)
      setCalChoice(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open that file')
    }
  }

  const fit = useCallback(() => {
    const vp = vpRef.current
    if (!vp || !img) return
    const r = vp.getBoundingClientRect()
    const s = Math.min(r.width / img.w, r.height / img.h)
    setView({ s, tx: (r.width - img.w * s) / 2, ty: (r.height - img.h * s) / 2 })
  }, [img])
  useEffect(() => { fit() }, [fit])

  // ---------- coordinates ----------
  const toImage = (clientX: number, clientY: number): Point => {
    const r = vpRef.current!.getBoundingClientRect()
    return { x: (clientX - r.left - view.tx) / view.s, y: (clientY - r.top - view.ty) / view.s }
  }

  // ---------- pan / pinch / tap on the viewport ----------
  const onVpDown = (e: RPointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = {
      startView: view,
      start: new Map(pointers.current),
      downAt: { x: e.clientX, y: e.clientY },
      moved: pointers.current.size > 1,
    }
  }
  const onVpMove = (e: RPointerEvent) => {
    if (drag.current) return onHandleMove(e)
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const r = vpRef.current!.getBoundingClientRect()
    const now = [...pointers.current.values()]
    const was = [...g.start.values()]
    if (Math.hypot(e.clientX - g.downAt.x, e.clientY - g.downAt.y) > 6) g.moved = true
    if (now.length === 1 && was.length === 1) {
      setView({ ...g.startView, tx: g.startView.tx + now[0].x - was[0].x, ty: g.startView.ty + now[0].y - was[0].y })
    } else if (now.length >= 2 && was.length >= 2) {
      const mid = (p: { x: number; y: number }[]) => ({ x: (p[0].x + p[1].x) / 2 - r.left, y: (p[0].y + p[1].y) / 2 - r.top })
      const dist = (p: { x: number; y: number }[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1
      const m0 = mid(was), m1 = mid(now)
      const s = clamp(g.startView.s * (dist(now) / dist(was)), 0.05, 40)
      const ix = (m0.x - g.startView.tx) / g.startView.s
      const iy = (m0.y - g.startView.ty) / g.startView.s
      setView({ s, tx: m1.x - ix * s, ty: m1.y - iy * s })
    }
  }
  const onVpUp = (e: RPointerEvent) => {
    if (drag.current) { drag.current = null; return }
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    if (g && !g.moved && pointers.current.size === 0) onTap(toImage(e.clientX, e.clientY))
    if (pointers.current.size === 0) gesture.current = null
    else gesture.current = { startView: view, start: new Map(pointers.current), downAt: { x: 0, y: 0 }, moved: true }
  }
  const onWheel = (e: React.WheelEvent) => {
    const r = vpRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    const s = clamp(view.s * Math.exp(-e.deltaY * 0.0015), 0.05, 40)
    const ix = (mx - view.tx) / view.s, iy = (my - view.ty) / view.s
    setView({ s, tx: mx - ix * s, ty: my - iy * s })
  }
  const zoomBy = (f: number) => {
    const r = vpRef.current!.getBoundingClientRect()
    const mx = r.width / 2, my = r.height / 2
    const s = clamp(view.s * f, 0.05, 40)
    const ix = (mx - view.tx) / view.s, iy = (my - view.ty) / view.s
    setView({ s, tx: mx - ix * s, ty: my - iy * s })
  }

  const onTap = (p: Point) => {
    if (calStep) {
      const pts = [...calStep.pts, p]
      if (calStep.axis === 'quad') {
        if (pts.length === 4) { setCalStep(null); setQuadPrompt(pts) }
        else setCalStep({ ...calStep, pts })
        return
      }
      if (pts.length === 2) { setCalStep(null); setCalPrompt({ axis: calStep.axis, pts }) }
      else setCalStep({ ...calStep, pts })
      return
    }
    if (placing && placing.lead) {
      const pts = [...placing.pts, p]
      if (pts.length === 3) commitPlacing(pts)
      else setPlacing({ ...placing, pts })
      return
    }
    setSelected(null)
    setSelMarker(null)
  }

  const commitPlacing = (pts: Point[]) => {
    if (!placing?.lead) return
    const lead = placing.lead
    const kind = placing.kind
    const m: Marker = { id: nextId++, kind, lead, pts }
    // One marker per lead per tool: re-measuring a lead replaces it.
    setMarkers(ms => [...ms.filter(x => !(x.kind === kind && x.lead === lead)), m])
    setPlacing(null)
    setSelMarker(m.id)
    setSelected(null)
  }

  const finishCal = (knownMm: number) => {
    if (!calPrompt) return
    try {
      const v = pxPerMm(calPrompt.pts[0], calPrompt.pts[1], calPrompt.axis, knownMm)
      setCal(c => calPrompt.axis === 'x' ? { ...c, pxPerMmX: v } : { ...c, pxPerMmY: v })
      const axis = calPrompt.axis
      setCalPrompt(null)
      if (axis === 'x' && !cal.pxPerMmY) setCalStep({ axis: 'y', pts: [] })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Calibration failed')
      setCalPrompt(null)
    }
  }

  const finishQuad = async (wMm: number, hMm: number) => {
    if (!quadPrompt || !img) return
    const taps = quadPrompt
    setQuadPrompt(null)
    setBusy('Straightening photo…')
    try {
      // Let the busy banner paint before the heavy pixel loop.
      await new Promise(r => setTimeout(r, 30))
      const out = await straighten(img.src, taps, wMm, hMm)
      setImg({ ...img, src: out.src, w: out.w, h: out.h })
      setCal(c => ({ ...c, pxPerMmX: out.pxPerMm, pxPerMmY: out.pxPerMm }))
      setCalipers([]); setMarkers([]); setSelected(null); setSelMarker(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not straighten that photo')
    } finally { setBusy(null) }
  }

  const doExport = async () => {
    setExporting(false)
    const vp = vpRef.current, el = vp?.querySelector('.stage img') as HTMLImageElement | null, svg = vp?.querySelector('svg.overlay') as SVGSVGElement | null
    if (!vp || !el || !svg || !img) return
    setSelected(null); setSelMarker(null)
    setBusy('Preparing export…')
    try {
      const lines: string[] = []
      const add = (k: string, v: string) => { if (v !== '—') lines.push(`${k} ${v}`) }
      add('Rate', fmt(results.rate, 0, '/min')); add('PR', fmt(results.pr, 0, ' ms')); add('QRS', fmt(results.qrs, 0, ' ms'))
      add('QT', fmt(results.qt, 0, ' ms')); add('QTc Bazett', fmt(results.qtcB, 0, ' ms')); add('QTc Fridericia', fmt(results.qtcF, 0, ' ms'))
      if (axis.deg != null) lines.push(`Axis ${Math.round(axis.deg)}°`)
      for (const r of stRows) lines.push(`${r.lead} ST ${r.st >= 0 ? '+' : '−'}${Math.abs(r.st).toFixed(1)} mm`)
      const r = vp.getBoundingClientRect()
      await exportView({ img: el, svg, w: img.w, h: img.h, view, vpW: r.width, vpH: r.height, lines })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setErr(e instanceof Error ? e.message : 'Export failed')
    } finally { setBusy(null) }
  }

  // ---------- calipers ----------
  const viewCenter = (): Point => {
    const r = vpRef.current!.getBoundingClientRect()
    return toImage(r.left + r.width / 2, r.top + r.height / 2)
  }
  const addCaliper = (kind: 'time' | 'amp') => {
    const c = viewCenter()
    // Start one large box wide (5 mm) if calibrated, else a fixed screen size.
    const half = kind === 'time'
      ? (cal.pxPerMmX ? cal.pxPerMmX * 10 : 80 / view.s)
      : (cal.pxPerMmY ? cal.pxPerMmY * 5 : 60 / view.s)
    const cp: Caliper = kind === 'time'
      ? { id: nextId++, kind, type: 'R-R', a: { x: c.x - half, y: c.y }, b: { x: c.x + half, y: c.y }, beats: 1, march: false }
      : { id: nextId++, kind, type: 'R amp', a: { x: c.x, y: c.y - half }, b: { x: c.x, y: c.y + half }, beats: 1, march: false }
    setCalipers(cs => [...cs, cp])
    setSelected(cp.id)
  }
  const update = (id: number, patch: Partial<Caliper>) =>
    setCalipers(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)))
  const remove = (id: number) => { setCalipers(cs => cs.filter(c => c.id !== id)); setSelected(null) }

  const onHandleDown = (e: RPointerEvent, id: number, leg: 'a' | 'b' | 'bar') => {
    e.stopPropagation()
    vpRef.current!.setPointerCapture(e.pointerId)
    drag.current = { id, leg, last: toImage(e.clientX, e.clientY) }
    setSelected(id)
    setSelMarker(null)
  }
  const onPointDown = (e: RPointerEvent, marker: number, idx: number) => {
    e.stopPropagation()
    vpRef.current!.setPointerCapture(e.pointerId)
    drag.current = { marker, idx, last: toImage(e.clientX, e.clientY) }
    setSelMarker(marker)
    setSelected(null)
  }
  const onHandleMove = (e: RPointerEvent) => {
    const d = drag.current!
    const p = toImage(e.clientX, e.clientY)
    if ('marker' in d) {
      const dx = p.x - d.last.x, dy = p.y - d.last.y
      d.last = p
      setMarkers(ms => ms.map(m => m.id !== d.marker ? m : { ...m, pts: m.pts.map((q, i) => i === d.idx ? { x: q.x + dx, y: q.y + dy } : q) }))
      return
    }
    const dx = p.x - d.last.x, dy = p.y - d.last.y
    d.last = p
    setCalipers(cs => cs.map(c => {
      if (c.id !== d.id) return c
      const mv = (q: Point) => ({ x: q.x + dx, y: q.y + dy })
      if (d.leg === 'bar') return { ...c, a: mv(c.a), b: mv(c.b) }
      // Legs slide along their measuring axis; the bar position follows the drag.
      if (c.kind === 'time') {
        const a = d.leg === 'a' ? { x: c.a.x + dx, y: c.a.y + dy } : { ...c.a, y: c.a.y + dy }
        const b = d.leg === 'b' ? { x: c.b.x + dx, y: c.b.y + dy } : { ...c.b, y: c.b.y + dy }
        return { ...c, a, b }
      }
      const a = d.leg === 'a' ? { x: c.a.x + dx, y: c.a.y + dy } : { ...c.a, x: c.a.x + dx }
      const b = d.leg === 'b' ? { x: c.b.x + dx, y: c.b.y + dy } : { ...c.b, x: c.b.x + dx }
      return { ...c, a, b }
    }))
  }

  // ---------- results ----------
  const valueOf = useCallback((c: Caliper): number | null => {
    if (c.kind === 'time') return calibratedX ? pxToMs(c.b.x - c.a.x, fullCal) : null
    return calibratedY ? pxToMv(c.b.y - c.a.y, fullCal) : null
  }, [calibratedX, calibratedY, fullCal])

  const results = useMemo(() => {
    const latest = (t: string) => [...calipers].reverse().find(c => c.type === t)
    const val = (t: string) => { const c = latest(t); return c ? valueOf(c) : null }
    const rrC = latest('R-R')
    const rrMs = rrC && calibratedX ? pxToMs(rrC.b.x - rrC.a.x, fullCal) / rrC.beats : null
    const qt = val('QT')
    const r = val('R amp'), s = val('S amp')
    return {
      rate: rrMs ? rateFromSpan(rrMs) : null,
      rrMs,
      pr: val('PR'), qrs: val('QRS'), qt, pw: val('P wave'),
      qtcB: qt && rrMs ? qtcBazett(qt, rrMs) : null,
      qtcF: qt && rrMs ? qtcFridericia(qt, rrMs) : null,
      pAmp: val('P amp'), rAmp: r, sAmp: s,
      rs: r && s ? r / s : null,
    }
  }, [calipers, valueOf, calibratedX, fullCal])

  const stRows = useMemo(() => {
    if (!cal.pxPerMmY) return []
    return markers.filter(m => m.kind === 'ste')
      .sort((a, b) => LEADS.indexOf(a.lead) - LEADS.indexOf(b.lead))
      .map(m => {
        const st = stDeviationMm(m.pts[0], m.pts[1], cal.pxPerMmY!)
        const hasPeak = m.pts[2] && (m.pts[2].x !== m.pts[1].x || m.pts[2].y !== m.pts[1].y)
        const q = hasPeak ? heightMm(m.pts[0], m.pts[2], cal.pxPerMmY!) : null
        const mv = st / (cal.gainMmPerMv ?? 10)
        return { lead: m.lead, st, mv, ratio: q ? Math.abs(st) / q : null, flag: stFlag(m.lead, mv, patient) }
      })
  }, [markers, cal.pxPerMmY, cal.gainMmPerMv, patient])

  const axis = useMemo(() => {
    if (!cal.pxPerMmY) return { deg: null as number | null, nets: {} as Partial<Record<Lead, number>> }
    const nets: Partial<Record<Lead, number>> = {}
    for (const m of markers) if (m.kind === 'axis') nets[m.lead] = netQrsMm(m.pts[0], m.pts[1], m.pts[2], cal.pxPerMmY)
    return { deg: frontalAxis(nets), nets }
  }, [markers, cal.pxPerMmY])

  const sel = calipers.find(c => c.id === selected) || null
  const selM = markers.find(m => m.id === selMarker) || null
  const startPlacing = (kind: 'ste' | 'axis') => {
    if (!cal.pxPerMmY) { setErr('Calibrate voltage (vertical) first: tap Calibrate.'); return }
    setPlacing({ kind, lead: null, pts: [] }); setSelected(null); setSelMarker(null)
  }
  const hs = 1 / view.s // keeps handles a constant size on screen

  // ---------- render ----------
  if (!img) {
    return (
      <div className="app">
        <header className="bar"><h1>ECG Calipers</h1></header>
        <main className="welcome">
          <p className="lead">Measure a real ECG with calipers you place yourself.</p>
          <label className="btn primary big">
            Take a photo
            <input type="file" accept="image/*" capture="environment" hidden onChange={e => onFile(e.target.files?.[0])} />
          </label>
          <label className="btn big">
            Open an image or PDF
            <input type="file" accept="image/*,application/pdf" hidden onChange={e => onFile(e.target.files?.[0])} />
          </label>
          {err && <p className="err">{err}</p>}
          <p className="fine">Your ECG never leaves this device. Before you share an export, crop out any patient name, date of birth or record number.</p>
          <p className="fine">A measurement aid for trained providers. You place every point; the app does not find waves or interpret rhythms.</p>
        </main>
      </div>
    )
  }

  const status = busy ? busy : calStep?.axis === 'quad'
    ? `Straighten: tap the 4 corners of a block of grid boxes (${calStep.pts.length} of 4). A bigger block is more accurate.`
    : placing?.lead
    ? `${placing.lead}: tap ${STEPS[placing.kind][placing.pts.length]}`
    : calStep
    ? `Calibrate ${calStep.axis === 'x' ? 'time (horizontal)' : 'voltage (vertical)'}: tap ${calStep.pts.length === 0 ? 'the first' : 'the second'} point across a known span of grid`
    : !calibratedX ? 'Calibrate time to see measurements' : null

  return (
    <div className="app">
      <header className="bar">
        <button className="btn ghost" onClick={() => { setImg(null); setCalStep(null) }}>New</button>
        <h1>ECG Calipers</h1>
        <button className="btn ghost" onClick={() => setExporting(true)}>Share</button>
        <button className="btn ghost" onClick={() => setSheet(true)}>Results</button>
      </header>

      <div
        className="viewport"
        ref={vpRef}
        onPointerDown={onVpDown}
        onPointerMove={onVpMove}
        onPointerUp={onVpUp}
        onPointerCancel={onVpUp}
        onWheel={onWheel}
      >
        <div className="hud" onPointerDown={e => e.stopPropagation()}>
      {status && <div className="status">{status}{calStep && <button className="link" onClick={() => setCalStep(null)}>Cancel</button>}
        {placing?.lead && placing.pts.length === 2 && <button className="link" onClick={() => commitPlacing([...placing.pts, placing.kind === 'axis' ? placing.pts[0] : placing.pts[1]])}>{placing.kind === 'axis' ? 'No S wave' : 'Skip'}</button>}
        {placing?.lead && <button className="link" onClick={() => setPlacing(null)}>Cancel</button>}</div>}
      {err && <div className="status err" onClick={() => setErr(null)}>{err} (tap to dismiss)</div>}
        </div>
        <div className="stage" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, width: img.w, height: img.h }}>
          <img src={img.src} width={img.w} height={img.h} draggable={false} alt="ECG" />
          <svg className={`overlay ${placing?.lead || calStep ? 'tapping' : ''}`} width={img.w} height={img.h} viewBox={`0 0 ${img.w} ${img.h}`}>
            {(calStep?.pts ?? calPrompt?.pts ?? []).map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={7 * hs} className="calpt" />
            ))}
            {placing?.pts.map((p, i) => <circle key={`p${i}`} cx={p.x} cy={p.y} r={6 * hs} className="calpt" />)}
            {cal.pxPerMmY && markers.map(m => (
              <MarkerShape key={m.id} m={m} hs={hs} pxPerMmY={cal.pxPerMmY!} selected={m.id === selMarker} onDown={onPointDown} />
            ))}
            {calipers.map(c => (
              <CaliperShape key={c.id} c={c} hs={hs} h={img.h} w={img.w} selected={c.id === selected}
                label={labelFor(c, valueOf(c))} onDown={onHandleDown} />
            ))}
          </svg>
        </div>
        <div className="zoom">
          <button className="btn round" onClick={() => zoomBy(1.4)} aria-label="Zoom in">+</button>
          <button className="btn round" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
          <button className="btn round" onClick={fit} aria-label="Fit">⤢</button>
        </div>
      </div>

      {placing && !placing.lead && (
        <div className="panel">
          <div className="row"><b>{placing.kind === 'ste' ? 'ST: which lead?' : 'Axis: which lead?'}</b><span className="grow" /><button className="btn small" onClick={() => setPlacing(null)}>Cancel</button></div>
          <div className="chips wrap">
            {(placing.kind === 'axis' ? AXIS_LEADS : [...LEADS]).map(l => {
              const done = markers.some(m => m.kind === placing.kind && m.lead === l)
              return <button key={l} className={`chip ${done ? 'on' : ''}`} style={{ '--c': placing.kind === 'ste' ? '#dc2626' : '#0d9488' } as React.CSSProperties}
                onClick={() => setPlacing({ ...placing, lead: l })}>{l}{l === 'II' && placing.kind === 'axis' ? ' (optional)' : ''}</button>
            })}
          </div>
          {placing.kind === 'axis' && <p className="fine">Measure I and aVF; adding II refines the result. Re-tapping a lead replaces it.</p>}
        </div>
      )}

      {selM && !placing && (
        <div className="panel">
          <div className="row">
            <b>{selM.kind === 'ste' ? 'ST' : 'Axis'} · {selM.lead}</b>
            <span className="fine">Drag any dot to adjust.</span>
            <span className="grow" />
            <button className="btn small danger" onClick={() => { setMarkers(ms => ms.filter(m => m.id !== selM.id)); setSelMarker(null) }}>Delete</button>
          </div>
        </div>
      )}

      {sel && (
        <div className="panel">
          <div className="chips">
            {(sel.kind === 'time' ? TIME_TYPES : AMP_TYPES).map(t => (
              <button key={t} className={`chip ${sel.type === t ? 'on' : ''}`} style={{ '--c': COLORS[t] } as React.CSSProperties}
                onClick={() => update(sel.id, { type: t })}>{t}</button>
            ))}
          </div>
          <div className="row">
            {sel.type === 'R-R' && (
              <label className="beats">Spans
                <button className="btn small" onClick={() => update(sel.id, { beats: Math.max(1, sel.beats - 1) })}>−</button>
                <b>{sel.beats}</b>
                <button className="btn small" onClick={() => update(sel.id, { beats: sel.beats + 1 })}>+</button>
                {sel.beats === 1 ? 'beat' : 'beats'}
              </label>
            )}
            {sel.kind === 'time' && (
              <button className={`btn small ${sel.march ? 'primary' : ''}`} onClick={() => update(sel.id, { march: !sel.march })}>March out</button>
            )}
            <span className="grow" />
            <button className="btn small danger" onClick={() => remove(sel.id)}>Delete</button>
          </div>
        </div>
      )}

      <nav className="tools">
        <button className="btn" onClick={() => setCalChoice(true)}>Calibrate</button>
        <button className="btn primary" disabled={!!calStep} onClick={() => addCaliper('time')}>⟷ Time</button>
        <button className="btn primary" disabled={!!calStep} onClick={() => addCaliper('amp')}>↕ Amp</button>
        <button className="btn ste" disabled={!!calStep} onClick={() => startPlacing('ste')}>STE</button>
        <button className="btn" disabled={!!calStep} onClick={() => startPlacing('axis')}>Axis</button>
      </nav>

      {calChoice && (
        <div className="sheet-bg" onClick={() => setCalChoice(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h2>Calibrate</h2>
            <button className="btn primary big" onClick={() => { setCalChoice(false); setCalStep({ axis: 'quad', pts: [] }) }}>
              Straighten photo (4 corners)
            </button>
            <p className="fine">Best for camera photos taken at an angle. Tap the corners of a block of grid boxes; the photo is squared up and both axes are calibrated at once.</p>
            <button className="btn big" onClick={() => { setCalChoice(false); setCalStep({ axis: 'x', pts: [] }) }}>
              Quick (2 taps each way)
            </button>
            <p className="fine">Best for flat scans, PDFs and straight-on photos.</p>
          </div>
        </div>
      )}

      {quadPrompt && <QuadPrompt onDone={finishQuad} onCancel={() => setQuadPrompt(null)} />}

      {exporting && (
        <div className="sheet-bg" onClick={() => setExporting(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h2>Check for patient identifiers</h2>
            <p>Only what is on screen right now is exported. Zoom and pan so no patient name, date of birth, record number or other identifier is visible.</p>
            <div className="row">
              <button className="btn" onClick={() => setExporting(false)}>Go back and crop</button>
              <span className="grow" />
              <button className="btn primary" onClick={doExport}>Nothing identifying is visible, export</button>
            </div>
          </div>
        </div>
      )}

      {calPrompt && <CalPrompt axis={calPrompt.axis} onDone={finishCal} onCancel={() => setCalPrompt(null)} />}

      {sheet && (
        <div className="sheet-bg" onClick={() => setSheet(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h2>Measurements</h2>
            <Settings cal={cal} setCal={setCal} />
            <div className="row settings">
              <label>Sex
                <select value={patient.sex} onChange={e => setPatient(p => ({ ...p, sex: e.target.value as Patient['sex'] }))}>
                  <option value="unset">Not set</option><option value="male">Male</option><option value="female">Female</option>
                </select>
              </label>
              <label>Age
                <select value={patient.age} onChange={e => setPatient(p => ({ ...p, age: e.target.value as Patient['age'] }))}>
                  <option value="unset">Not set</option><option value="under40">16–39</option><option value="40plus">40+</option>
                </select>
              </label>
            </div>
            <table>
              <tbody>
                <Row k="Heart rate" v={fmt(results.rate, 0, '/min')} sub={results.rrMs ? `R-R ${fmt(results.rrMs, 0, ' ms')}` : undefined} />
                <Row k="PR" v={fmt(results.pr, 0, ' ms')} />
                <Row k="QRS" v={fmt(results.qrs, 0, ' ms')} flag={qrsFlag(results.qrs)} />
                <Row k="QT" v={fmt(results.qt, 0, ' ms')} />
                <Row k="QTc (Bazett)" v={fmt(results.qtcB, 0, ' ms')} flag={qtcFlag(results.qtcB, patient)} />
                <Row k="QTc (Fridericia)" v={fmt(results.qtcF, 0, ' ms')} flag={qtcFlag(results.qtcF, patient)} />
                <Row k="P wave width" v={fmt(results.pw, 0, ' ms')} />
                <Row k="P amplitude" v={fmt(results.pAmp, 2, ' mV')} />
                <Row k="R amplitude" v={fmt(results.rAmp, 2, ' mV')} />
                <Row k="S amplitude" v={fmt(results.sAmp, 2, ' mV')} />
                <Row k="R:S ratio" v={fmt(results.rs, 2, '')} />
              </tbody>
            </table>
            {stRows.length > 0 && (
              <>
                <h3>ST deviation at the J point</h3>
                <table><tbody>
                  {stRows.map(r => <Row key={r.lead} k={r.lead} v={`${r.st >= 0 ? '+' : '−'}${Math.abs(r.st).toFixed(1)} mm`} sub={`${r.mv >= 0 ? '+' : '−'}${Math.abs(r.mv).toFixed(2)} mV${r.ratio != null ? ` · ST:QRS ${r.ratio.toFixed(2)}` : ''}`} flag={r.flag} />)}
                </tbody></table>
              </>
            )}
            <h3>Frontal QRS axis</h3>
            <table><tbody>
              <Row k="Axis" v={axis.deg == null ? '—' : `${axis.deg >= 0 ? '+' : '−'}${Math.abs(Math.round(axis.deg))}°`}
                flag={axisFlag(axis.deg)}
                sub={Object.keys(axis.nets).length ? (Object.entries(axis.nets) as [Lead, number][]).map(([l, v]) => `${l} ${v >= 0 ? '+' : ''}${v.toFixed(1)} mm`).join(' · ') : 'Use Axis to measure leads I and aVF'} />
            </tbody></table>
            <p className="fine">Values come only from points you placed. Flags are for adults (over 16) and compare each value with the cited guideline; tap a flag to see the source's words. They are reference marks, not a diagnosis. The ST flags look at one lead at a time: contiguous-lead criteria are yours to apply. Part IV recommends regression-based QT correction over Bazett; Bazett and Fridericia are shown side by side for comparison.</p>
            <h3>Sources</h3>
            {Object.values(REFS).map(r => <p key={r.id} className="fine"><a href={r.url} target="_blank" rel="noreferrer">{r.citation}</a></p>)}
            <button className="btn primary" onClick={() => setSheet(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

function CaliperShape({ c, hs, w, h, selected, label, onDown }: {
  c: Caliper; hs: number; w: number; h: number; selected: boolean; label: string
  onDown: (e: RPointerEvent, id: number, leg: 'a' | 'b' | 'bar') => void
}) {
  const col = COLORS[c.type] ?? COLORS.Other
  const sw = (selected ? 2.5 : 1.75) * hs
  const grab = 22 * hs // generous invisible touch target
  if (c.kind === 'time') {
    const y = c.a.y
    const span = c.b.x - c.a.x
    const marks: number[] = []
    if (c.march && Math.abs(span) > 2 * hs) {
      for (let x = c.b.x + span; x > 0 && x < w; x += span) marks.push(x)
      for (let x = c.a.x - span; x > 0 && x < w; x -= span) marks.push(x)
    }
    return (
      <g style={{ color: col }}>
        {marks.map((x, i) => <line key={i} x1={x} x2={x} y1={0} y2={h} stroke={col} strokeWidth={1.25 * hs} strokeDasharray={`${6 * hs} ${5 * hs}`} opacity={0.75} />)}
        <line x1={c.a.x} x2={c.a.x} y1={0} y2={h} stroke={col} strokeWidth={sw} />
        <line x1={c.b.x} x2={c.b.x} y1={0} y2={h} stroke={col} strokeWidth={sw} />
        <line x1={c.a.x} x2={c.b.x} y1={y} y2={y} stroke={col} strokeWidth={sw} />
        <line x1={c.a.x} x2={c.b.x} y1={y} y2={y} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'bar')} className="grab" />
        <line x1={c.a.x} x2={c.a.x} y1={0} y2={h} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'a')} className="grab ew" />
        <line x1={c.b.x} x2={c.b.x} y1={0} y2={h} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'b')} className="grab ew" />
        <circle cx={c.a.x} cy={y} r={6 * hs} fill={col} />
        <circle cx={c.b.x} cy={y} r={6 * hs} fill={col} />
        <Tag x={(c.a.x + c.b.x) / 2} y={y - 12 * hs} hs={hs} text={label} col={col} />
      </g>
    )
  }
  const x = c.a.x
  return (
    <g>
      <line x1={0} x2={w} y1={c.a.y} y2={c.a.y} stroke={col} strokeWidth={sw} />
      <line x1={0} x2={w} y1={c.b.y} y2={c.b.y} stroke={col} strokeWidth={sw} />
      <line x1={x} x2={x} y1={c.a.y} y2={c.b.y} stroke={col} strokeWidth={sw} />
      <line x1={x} x2={x} y1={c.a.y} y2={c.b.y} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'bar')} className="grab" />
      <line x1={0} x2={w} y1={c.a.y} y2={c.a.y} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'a')} className="grab ns" />
      <line x1={0} x2={w} y1={c.b.y} y2={c.b.y} stroke="transparent" strokeWidth={grab} onPointerDown={e => onDown(e, c.id, 'b')} className="grab ns" />
      <circle cx={x} cy={c.a.y} r={6 * hs} fill={col} />
      <circle cx={x} cy={c.b.y} r={6 * hs} fill={col} />
      <Tag x={x + 10 * hs} y={(c.a.y + c.b.y) / 2} hs={hs} text={label} col={col} anchor="start" />
    </g>
  )
}

function MarkerShape({ m, hs, pxPerMmY, selected, onDown }: {
  m: Marker; hs: number; pxPerMmY: number; selected: boolean
  onDown: (e: RPointerEvent, id: number, idx: number) => void
}) {
  const col = m.kind === 'ste' ? '#dc2626' : '#0d9488'
  const [base, p1, p2] = m.pts
  const mm = pxPerMmY
  const halfW = 40 * mm // baseline line spans 40 mm either side of the J point
  const sw = (selected ? 2.25 : 1.5) * hs
  const dots = m.pts.map((p, i) => (
    <g key={i}>
      <circle cx={p.x} cy={p.y} r={5 * hs} fill={i === 0 ? '#fff' : col} stroke={col} strokeWidth={2 * hs} />
      <circle cx={p.x} cy={p.y} r={18 * hs} fill="transparent" className="grab" onPointerDown={e => onDown(e, m.id, i)} />
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
  // STE: baseline across the lead, a mm ruler at the J point, and a line at the J level.
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
      <line x1={p1.x} x2={p1.x + 10 * mm} y1={p1.y} y2={p1.y} stroke={col} strokeWidth={sw} />
      <line x1={p1.x} x2={p1.x} y1={base.y - n * mm} y2={base.y + n * mm} stroke={col} strokeWidth={hs} />
      {ticks}
      {dots}
      <Tag x={p1.x + 12 * hs} y={p1.y - 10 * hs} hs={hs} col={col} anchor="start"
        text={`${m.lead} ST ${st >= 0 ? '+' : '−'}${Math.abs(st).toFixed(1)} mm${q ? ` · ${(Math.abs(st) / q).toFixed(2)} of QRS` : ''}`} />
    </g>
  )
}

function Tag({ x, y, hs, text, col, anchor = 'middle' }: { x: number; y: number; hs: number; text: string; col: string; anchor?: 'middle' | 'start' }) {
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

function CalPrompt({ axis, onDone, onCancel }: { axis: 'x' | 'y'; onDone: (mm: number) => void; onCancel: () => void }) {
  const [boxes, setBoxes] = useState(axis === 'x' ? 5 : 2)
  const [size, setSize] = useState<'large' | 'small'>('large')
  const mm = boxes * (size === 'large' ? 5 : 1)
  return (
    <div className="sheet-bg">
      <div className="sheet">
        <h2>How far apart were your taps?</h2>
        <p>{axis === 'x' ? 'Horizontal' : 'Vertical'} distance between the two points:</p>
        <div className="row center">
          <button className="btn small" onClick={() => setBoxes(b => Math.max(1, b - 1))}>−</button>
          <b className="num">{boxes}</b>
          <button className="btn small" onClick={() => setBoxes(b => b + 1)}>+</button>
          <select value={size} onChange={e => setSize(e.target.value as 'large' | 'small')}>
            <option value="large">large boxes (5 mm)</option>
            <option value="small">small boxes (1 mm)</option>
          </select>
        </div>
        <p className="fine">= {mm} mm. Spanning more boxes gives a more accurate calibration.</p>
        <div className="row">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <span className="grow" />
          <button className="btn primary" onClick={() => onDone(mm)}>Set</button>
        </div>
      </div>
    </div>
  )
}

function QuadPrompt({ onDone, onCancel }: { onDone: (wMm: number, hMm: number) => void; onCancel: () => void }) {
  const [w, setW] = useState(5)
  const [h, setH] = useState(4)
  const step = (v: number, d: number) => Math.max(1, v + d)
  return (
    <div className="sheet-bg">
      <div className="sheet">
        <h2>How big is the block you tapped?</h2>
        <p className="fine">Count large boxes (5 mm each).</p>
        <div className="row center">Wide
          <button className="btn small" onClick={() => setW(v => step(v, -1))}>−</button><b className="num">{w}</b>
          <button className="btn small" onClick={() => setW(v => step(v, 1))}>+</button>
        </div>
        <div className="row center">Tall
          <button className="btn small" onClick={() => setH(v => step(v, -1))}>−</button><b className="num">{h}</b>
          <button className="btn small" onClick={() => setH(v => step(v, 1))}>+</button>
        </div>
        <p className="fine">= {w * 5} × {h * 5} mm</p>
        <div className="row">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <span className="grow" />
          <button className="btn primary" onClick={() => onDone(w * 5, h * 5)}>Straighten</button>
        </div>
      </div>
    </div>
  )
}

function Settings({ cal, setCal }: { cal: Partial<Calibration>; setCal: (f: (c: Partial<Calibration>) => Partial<Calibration>) => void }) {
  return (
    <div className="row settings">
      <label>Paper speed
        <select value={cal.paperSpeedMmPerS} onChange={e => setCal(c => ({ ...c, paperSpeedMmPerS: Number(e.target.value) }))}>
          <option value={25}>25 mm/s</option>
          <option value={50}>50 mm/s</option>
        </select>
      </label>
      <label>Gain
        <select value={cal.gainMmPerMv} onChange={e => setCal(c => ({ ...c, gainMmPerMv: Number(e.target.value) }))}>
          <option value={5}>5 mm/mV</option>
          <option value={10}>10 mm/mV</option>
          <option value={20}>20 mm/mV</option>
        </select>
      </label>
    </div>
  )
}

function Row({ k, v, sub, flag }: { k: string; v: string; sub?: string; flag?: Flag | null }) {
  const [open, setOpen] = useState(false)
  const rule = flag ? RULES[flag.rule] : null
  return (
    <tr>
      <th>{k}{sub && <small>{sub}</small>}
        {flag && rule && (
          <button className={`flag ${flag.level}`} onClick={() => setOpen(o => !o)}>
            {flag.text} <span className="src">· {REFS[rule.ref].short}, p. {rule.page}</span>
            {open && <q>{rule.quote}</q>}
          </button>
        )}
      </th>
      <td>{v}</td>
    </tr>
  )
}

function labelFor(c: Caliper, v: number | null): string {
  if (v == null) return c.type
  if (c.kind === 'amp') return `${c.type} ${v.toFixed(2)} mV`
  if (c.type === 'R-R') {
    const per = v / c.beats
    return `${Math.round(rateFromSpan(per))}/min${c.beats > 1 ? ` (${c.beats})` : ''}`
  }
  return `${c.type} ${Math.round(v)} ms`
}

function fmt(v: number | null, dp: number, unit: string) {
  return v == null || !isFinite(v) ? '—' : `${v.toFixed(dp)}${unit}`
}
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)) }
