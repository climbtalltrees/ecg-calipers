import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { loadFile, type LoadedImage } from './lib/loadImage'
import { straighten } from './lib/warp'
import { exportView } from './lib/exportView'
import { drawDemo } from './lib/demo'
import { isSquareOn, scaleFromBox, squareAt, type Quad } from './lib/calbox'
import { pxToMs, pxToMv, rateFromSpan, qtcBazett, qtcFridericia, type Calibration, type Point } from './lib/measure'
import { qrsFlag, qtcFlag, stFlag, axisFlag, type Flag, type Patient } from './lib/flags'
import { REFS, RULES } from './lib/references'
import { LEADS, stDeviationMm, heightMm, netQrsMm, frontalAxis, type Lead } from './lib/leads'
import { CaliperShape, MarkerShape, CalBoxShape, StepDiagram, COLORS, type Caliper, type Marker } from './components/shapes'
import { Intro, TOUR } from './components/Intro'

const TIME_TYPES = ['R-R', 'PR', 'QRS', 'QT', 'P wave', 'Other']
const AMP_TYPES = ['P amp', 'R amp', 'S amp', 'Other']

type Placing = null | { kind: 'ste' | 'axis'; lead: Lead | null; pts: Point[] }
const STEPS: Record<'ste' | 'axis', string[]> = {
  ste: ['Tap the baseline: a flat spot on the TP or PR segment.', 'Tap the J point: where the QRS ends and the ST segment begins.', 'Tap the tallest point of the QRS (for the ST:QRS ratio).'],
  axis: ['Tap the baseline: a flat spot before the QRS.', 'Tap the top of the R wave.', 'Tap the bottom of the S wave.'],
}
const AXIS_LEADS: Lead[] = ['I', 'aVF', 'II']

interface View { s: number; tx: number; ty: number }
interface CalBox { q: Quad; wBoxes: number; hBoxes: number }
type Drag =
  | { kind: 'caliper'; id: number; leg: 'a' | 'b' | 'bar'; last: Point }
  | { kind: 'marker'; id: number; idx: number; last: Point }
  | { kind: 'box'; corner: number | 'move'; last: Point }

let nextId = 1

function introSeen(): boolean {
  try { return localStorage.getItem('introSeen') === '1' } catch { return false }
}
function markIntroSeen() {
  try { localStorage.setItem('introSeen', '1') } catch { /* private mode: fine */ }
}

export default function App() {
  const [img, setImg] = useState<LoadedImage | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 })
  const [cal, setCal] = useState<Partial<Calibration>>({ paperSpeedMmPerS: 25, gainMmPerMv: 10 })
  const [calBox, setCalBox] = useState<CalBox | null>(null)
  const [lastBox, setLastBox] = useState<CalBox | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [calipers, setCalipers] = useState<Caliper[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [sheet, setSheet] = useState(false)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [placing, setPlacing] = useState<Placing>(null)
  const [selMarker, setSelMarker] = useState<number | null>(null)
  const [patient, setPatient] = useState<Patient>({ sex: 'unset', age: 'unset' })
  const [showIntro, setShowIntro] = useState(() => !introSeen())
  const [tour, setTour] = useState<number | null>(null)

  const vpRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startView: View; start: Map<number, { x: number; y: number }>; downAt: { x: number; y: number }; moved: boolean } | null>(null)
  const drag = useRef<Drag | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view

  const calibratedX = !!cal.pxPerMmX
  const calibratedY = !!cal.pxPerMmY
  const fullCal = cal as Calibration

  // ---------- loading ----------
  const resetFor = (loaded: LoadedImage) => {
    setImg(loaded)
    setCalipers([]); setMarkers([]); setPlacing(null); setSelected(null); setSelMarker(null)
    setCal(c => ({ paperSpeedMmPerS: c.paperSpeedMmPerS, gainMmPerMv: c.gainMmPerMv }))
    setLastBox(null)
    setCalBox(null)
    pendingBox.current = true
  }
  const pendingBox = useRef(false)

  const onFile = async (file?: File) => {
    if (!file) return
    setErr(null)
    try { resetFor(await loadFile(file)); setTour(null) } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open that file') }
  }
  const loadDemo = async () => {
    markIntroSeen(); setShowIntro(false)
    const d = await drawDemo()
    resetFor({ ...d, name: 'Practice strip' })
    setTour(0)
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
    const v = viewRef.current
    return { x: (clientX - r.left - v.tx) / v.s, y: (clientY - r.top - v.ty) / v.s }
  }
  const viewCenter = (): Point => {
    const r = vpRef.current!.getBoundingClientRect()
    return toImage(r.left + r.width / 2, r.top + r.height / 2)
  }

  // ---------- calibration box ----------
  const openCalBox = () => {
    setPlacing(null); setSelected(null); setSelMarker(null)
    if (lastBox) { setCalBox(lastBox); return }
    const r = vpRef.current!.getBoundingClientRect()
    const half = cal.pxPerMmX ? cal.pxPerMmX * 2.5 : Math.min(r.width, r.height) / 10 / viewRef.current.s
    setCalBox({ q: squareAt(viewCenter(), half), wBoxes: 1, hBoxes: 1 })
  }
  // Open the box once the new image has been fitted, so it lands in view.
  useEffect(() => {
    if (img && pendingBox.current) { pendingBox.current = false; requestAnimationFrame(() => requestAnimationFrame(openCalBox)) }
  })

  const lockCal = async () => {
    if (!calBox || !img) return
    const wMm = calBox.wBoxes * 5, hMm = calBox.hBoxes * 5
    if (isSquareOn(calBox.q)) {
      const s = scaleFromBox(calBox.q, wMm, hMm)
      setCal(c => ({ ...c, pxPerMmX: s.x, pxPerMmY: s.y }))
      setLastBox(calBox)
      setCalBox(null)
      if (tour === 0) setTour(1)
      return
    }
    // The box is skewed: the photo was taken at an angle, so square it up.
    const q = calBox.q
    setCalBox(null)
    setBusy('Photo is at an angle: straightening it…')
    try {
      await new Promise(r => setTimeout(r, 30))
      const out = await straighten(img.src, q, wMm, hMm)
      setImg({ ...img, src: out.src, w: out.w, h: out.h })
      setCal(c => ({ ...c, pxPerMmX: out.pxPerMm, pxPerMmY: out.pxPerMm }))
      setCalipers([]); setMarkers([]); setSelected(null); setSelMarker(null)
      setLastBox(null)
      if (tour === 0) setTour(1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not straighten that photo')
    } finally { setBusy(null) }
  }

  // ---------- pan / pinch / tap ----------
  const onVpDown = (e: RPointerEvent) => {
    // A primary pointer means no other finger is down: drop any stale entries.
    if (e.isPrimary) pointers.current.clear()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = { startView: view, start: new Map(pointers.current), downAt: { x: e.clientX, y: e.clientY }, moved: pointers.current.size > 1 }
  }
  const onVpMove = (e: RPointerEvent) => {
    if (drag.current) return onDragMove(e)
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const r = vpRef.current!.getBoundingClientRect()
    const now = [...pointers.current.values()]
    const was = [...g.start.values()]
    if (Math.hypot(e.clientX - g.downAt.x, e.clientY - g.downAt.y) > 8) g.moved = true
    if (now.length === 1 && was.length === 1) {
      if (g.moved) setView({ ...g.startView, tx: g.startView.tx + now[0].x - was[0].x, ty: g.startView.ty + now[0].y - was[0].y })
    } else if (now.length >= 2 && was.length >= 2) {
      const mid = (p: { x: number; y: number }[]) => ({ x: (p[0].x + p[1].x) / 2 - r.left, y: (p[0].y + p[1].y) / 2 - r.top })
      const dist = (p: { x: number; y: number }[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1
      const m0 = mid(was), m1 = mid(now)
      const s = clamp(g.startView.s * (dist(now) / dist(was)), 0.05, 40)
      const ix = (m0.x - g.startView.tx) / g.startView.s, iy = (m0.y - g.startView.ty) / g.startView.s
      setView({ s, tx: m1.x - ix * s, ty: m1.y - iy * s })
    }
  }
  const onVpUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (drag.current) { drag.current = null; gesture.current = null; return }
    const g = gesture.current
    if (g && !g.moved && pointers.current.size === 0 && e.type === 'pointerup') onTap(toImage(e.clientX, e.clientY))
    if (pointers.current.size === 0) gesture.current = null
    else gesture.current = { startView: view, start: new Map(pointers.current), downAt: { x: 0, y: 0 }, moved: true }
  }
  const zoomAt = (mx: number, my: number, f: number) => {
    const s = clamp(view.s * f, 0.05, 40)
    const ix = (mx - view.tx) / view.s, iy = (my - view.ty) / view.s
    setView({ s, tx: mx - ix * s, ty: my - iy * s })
  }
  const onWheel = (e: React.WheelEvent) => {
    const r = vpRef.current!.getBoundingClientRect()
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015))
  }
  const zoomBy = (f: number) => {
    const r = vpRef.current!.getBoundingClientRect()
    zoomAt(r.width / 2, r.height / 2, f)
  }

  const onTap = (p: Point) => {
    if (placing?.lead) {
      const pts = [...placing.pts, p]
      if (pts.length === 3) commitPlacing(pts)
      else setPlacing({ ...placing, pts })
      return
    }
    setSelected(null); setSelMarker(null)
  }

  // ---------- STE / axis placement ----------
  const nextAxisLead = (ms: Marker[]): Lead | null => {
    const done = new Set(ms.filter(m => m.kind === 'axis').map(m => m.lead))
    return !done.has('I') ? 'I' : !done.has('aVF') ? 'aVF' : null
  }
  const startPlacing = (kind: 'ste' | 'axis') => {
    if (!cal.pxPerMmY) { setErr('Calibrate first: fit the yellow box to one large square and tap Lock.'); openCalBox(); return }
    setCalBox(null); setSelected(null); setSelMarker(null)
    setPlacing({ kind, lead: kind === 'axis' ? nextAxisLead(markers) : null, pts: [] })
  }
  const commitPlacing = (pts: Point[]) => {
    if (!placing?.lead) return
    const { lead, kind } = placing
    const m: Marker = { id: nextId++, kind, lead, pts }
    const ms = [...markers.filter(x => !(x.kind === kind && x.lead === lead)), m]
    setMarkers(ms)
    setSelMarker(m.id)
    if (kind === 'axis') {
      const next = nextAxisLead(ms)
      setPlacing(next ? { kind, lead: next, pts: [] } : null)
      if (!next && tour === 5) setSheet(true)
    } else {
      setPlacing({ kind, lead: null, pts: [] }) // back to the lead list for the next lead
      if (tour === 4) setTour(5)
    }
  }
  const skipLast = () => {
    if (!placing?.lead || placing.pts.length !== 2) return
    // STE: no QRS peak (no ratio). Axis: no S wave, so S depth is zero.
    commitPlacing([...placing.pts, placing.kind === 'axis' ? placing.pts[0] : placing.pts[1]])
  }

  // ---------- calipers ----------
  const addCaliper = (kind: 'time' | 'amp') => {
    setPlacing(null); setCalBox(null)
    const c = viewCenter()
    const half = kind === 'time' ? (cal.pxPerMmX ? cal.pxPerMmX * 10 : 80 / view.s) : (cal.pxPerMmY ? cal.pxPerMmY * 5 : 60 / view.s)
    const cp: Caliper = kind === 'time'
      ? { id: nextId++, kind, type: calipers.some(x => x.type === 'R-R') ? 'QT' : 'R-R', a: { x: c.x - half, y: c.y }, b: { x: c.x + half, y: c.y }, beats: 1, march: false }
      : { id: nextId++, kind, type: 'R amp', a: { x: c.x, y: c.y - half }, b: { x: c.x, y: c.y + half }, beats: 1, march: false }
    setCalipers(cs => [...cs, cp])
    setSelected(cp.id); setSelMarker(null)
    if (tour === 1 && kind === 'time') setTour(2)
    if (tour === 3 && kind === 'time') setTour(4)
  }
  const update = (id: number, patch: Partial<Caliper>) => setCalipers(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)))
  const remove = (id: number) => { setCalipers(cs => cs.filter(c => c.id !== id)); setSelected(null) }

  const startDrag = (e: RPointerEvent, d: Drag) => {
    e.stopPropagation()
    vpRef.current!.setPointerCapture(e.pointerId)
    drag.current = d
  }
  const onCaliperDown = (e: RPointerEvent, id: number, leg: 'a' | 'b' | 'bar') => {
    startDrag(e, { kind: 'caliper', id, leg, last: toImage(e.clientX, e.clientY) })
    setSelected(id); setSelMarker(null)
  }
  const onMarkerDown = (e: RPointerEvent, id: number, idx: number) => {
    startDrag(e, { kind: 'marker', id, idx, last: toImage(e.clientX, e.clientY) })
    setSelMarker(id); setSelected(null)
  }
  const onDragMove = (e: RPointerEvent) => {
    const d = drag.current!
    const p = toImage(e.clientX, e.clientY)
    const dx = p.x - d.last.x, dy = p.y - d.last.y
    d.last = p
    if (d.kind === 'box') {
      setCalBox(b => b && ({ ...b, q: b.q.map((q, i) => (d.corner === 'move' || d.corner === i) ? { x: q.x + dx, y: q.y + dy } : q) as Quad }))
      return
    }
    if (d.kind === 'marker') {
      setMarkers(ms => ms.map(m => m.id !== d.id ? m : { ...m, pts: m.pts.map((q, i) => i === d.idx ? { x: q.x + dx, y: q.y + dy } : q) }))
      return
    }
    setCalipers(cs => cs.map(c => {
      if (c.id !== d.id) return c
      const mv = (q: Point) => ({ x: q.x + dx, y: q.y + dy })
      if (d.leg === 'bar') return { ...c, a: mv(c.a), b: mv(c.b) }
      if (c.kind === 'time') {
        const a = d.leg === 'a' ? mv(c.a) : { ...c.a, y: c.a.y + dy }
        const b = d.leg === 'b' ? mv(c.b) : { ...c.b, y: c.b.y + dy }
        return { ...c, a, b }
      }
      const a = d.leg === 'a' ? mv(c.a) : { ...c.a, x: c.a.x + dx }
      const b = d.leg === 'b' ? mv(c.b) : { ...c.b, x: c.b.x + dx }
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
      rate: rrMs ? rateFromSpan(rrMs) : null, rrMs,
      pr: val('PR'), qrs: val('QRS'), qt, pw: val('P wave'),
      qtcB: qt && rrMs ? qtcBazett(qt, rrMs) : null,
      qtcF: qt && rrMs ? qtcFridericia(qt, rrMs) : null,
      pAmp: val('P amp'), rAmp: r, sAmp: s, rs: r && s ? r / s : null,
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

  const sel = calipers.find(c => c.id === selected) || null
  const selM = markers.find(m => m.id === selMarker) || null
  const hs = 1 / view.s

  // ---------- render ----------
  const intro = showIntro && <Intro onDemo={loadDemo} onClose={() => { markIntroSeen(); setShowIntro(false) }} />

  if (!img) {
    return (
      <div className="app">
        <header className="bar"><span className="spacer" /><h1>ECGs Made Easy</h1><button className="btn ghost" onClick={() => setShowIntro(true)} aria-label="Help">?</button></header>
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
          <button className="btn big ghostish" onClick={loadDemo}>Try the demo strip with a guided tour</button>
          {err && <p className="err">{err}</p>}
          <p className="fine">Your ECG never leaves this device. A measurement aid for trained providers: you place every point; the app does not find waves or interpret rhythms.</p>
        </main>
        {intro}
      </div>
    )
  }

  const tapping = !!placing?.lead

  return (
    <div className="app">
      <header className="bar">
        <button className="btn ghost" onClick={() => { setImg(null); setTour(null); setCalBox(null); setPlacing(null) }}>New</button>
        <h1>ECGs Made Easy</h1>
        <button className="btn ghost" onClick={() => setShowIntro(true)} aria-label="Help">?</button>
        <button className="btn ghost" onClick={() => setExporting(true)}>Share</button>
        <button className="btn ghost" onClick={() => setSheet(true)}>Results</button>
      </header>

      <div className="viewport" ref={vpRef} onPointerDown={onVpDown} onPointerMove={onVpMove} onPointerUp={onVpUp} onPointerCancel={onVpUp} onWheel={onWheel}>
        <div className="stage" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, width: img.w, height: img.h }}>
          <img src={img.src} width={img.w} height={img.h} draggable={false} alt="ECG" />
          <svg className={`overlay ${tapping ? 'tapping' : ''}`} width={img.w} height={img.h} viewBox={`0 0 ${img.w} ${img.h}`}>
            {calipers.map(c => (
              <CaliperShape key={c.id} c={c} hs={hs} h={img.h} w={img.w} selected={c.id === selected} label={labelFor(c, valueOf(c))} onDown={onCaliperDown} />
            ))}
            {cal.pxPerMmY && markers.map(m => (
              <MarkerShape key={m.id} m={m} hs={hs} pxPerMmY={cal.pxPerMmY!} selected={m.id === selMarker} onDown={onMarkerDown} />
            ))}
            {placing?.pts.map((p, i) => <circle key={`p${i}`} cx={p.x} cy={p.y} r={6 * hs} className="calpt" />)}
            {calBox && (
              <CalBoxShape q={calBox.q} hs={hs}
                onCorner={(e, i) => startDrag(e, { kind: 'box', corner: i, last: toImage(e.clientX, e.clientY) })}
                onMove={e => startDrag(e, { kind: 'box', corner: 'move', last: toImage(e.clientX, e.clientY) })} />
            )}
          </svg>
        </div>
        <div className="hud" onPointerDown={e => e.stopPropagation()}>
          {busy && <div className="status">{busy}</div>}
          {err && <div className="status err" onClick={() => setErr(null)}>{err} (tap to dismiss)</div>}
          {calibratedX && calibratedY && !calBox && !busy && (
            <button className="lock" onClick={openCalBox} title="Tap to recalibrate">🔒 Calibrated · {cal.paperSpeedMmPerS} mm/s · {cal.gainMmPerMv} mm/mV</button>
          )}
        </div>
        <div className="zoom" onPointerDown={e => e.stopPropagation()}>
          <button className="btn round" onClick={() => zoomBy(1.4)} aria-label="Zoom in">+</button>
          <button className="btn round" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
          <button className="btn round" onClick={fit} aria-label="Fit">⤢</button>
        </div>
      </div>

      {calBox ? (
        <div className="panel coach">
          <b>Calibrate: fit the yellow box to the grid</b>
          <p className="fine">Zoom in, then drag each corner onto the corners of one large square. Drag the edge to move the whole box. A bigger block of squares is more accurate.</p>
          <div className="row">
            <span>Box covers</span>
            <Stepper v={calBox.wBoxes} set={v => setCalBox({ ...calBox, wBoxes: v })} />
            <span>×</span>
            <Stepper v={calBox.hBoxes} set={v => setCalBox({ ...calBox, hBoxes: v })} />
            <span>large boxes ({calBox.wBoxes * 5} × {calBox.hBoxes * 5} mm)</span>
          </div>
          <div className="row">
            {(calibratedX || lastBox) && <button className="btn" onClick={() => setCalBox(null)}>Cancel</button>}
            <span className="grow" />
            <button className="btn primary" onClick={lockCal}>🔒 Lock calibration</button>
          </div>
        </div>
      ) : placing && !placing.lead ? (
        <div className="panel coach">
          <div className="row"><b>{placing.kind === 'ste' ? 'ST: pick a lead' : 'Axis: pick a lead'}</b><span className="grow" /><button className="btn small" onClick={() => setPlacing(null)}>Done</button></div>
          <div className="chips wrap">
            {(placing.kind === 'axis' ? AXIS_LEADS : [...LEADS]).map(l => {
              const done = markers.some(m => m.kind === placing.kind && m.lead === l)
              return <button key={l} className={`chip ${done ? 'on' : ''}`} style={{ '--c': placing.kind === 'ste' ? '#dc2626' : '#0d9488' } as React.CSSProperties}
                onClick={() => setPlacing({ ...placing, lead: l })}>{done ? '✓ ' : ''}{l}</button>
            })}
          </div>
          <p className="fine">{placing.kind === 'ste' ? 'Measure each lead you want to check. A ✓ lead can be redone.' : 'Lead II is optional and refines the result.'}</p>
        </div>
      ) : placing?.lead ? (
        <div className="panel coach">
          <div className="row">
            <b>{placing.kind === 'ste' ? 'ST' : 'Axis'} · lead {placing.lead} · step {placing.pts.length + 1} of 3</b>
            <span className="grow" />
            <button className="btn small" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
          <div className="steprow">
            <StepDiagram kind={placing.kind} step={placing.pts.length} />
            <p className="stepText">{STEPS[placing.kind][placing.pts.length]}</p>
          </div>
          <div className="row">
            {placing.pts.length > 0 && <button className="btn small" onClick={() => setPlacing({ ...placing, pts: placing.pts.slice(0, -1) })}>Undo tap</button>}
            <span className="grow" />
            {placing.pts.length === 2 && <button className="btn small primary" onClick={skipLast}>{placing.kind === 'axis' ? 'No S wave' : 'Skip this step'}</button>}
          </div>
        </div>
      ) : sel ? (
        <div className="panel">
          <div className="chips">
            {(sel.kind === 'time' ? TIME_TYPES : AMP_TYPES).map(t => (
              <button key={t} className={`chip ${sel.type === t ? 'on' : ''}`} style={{ '--c': COLORS[t] } as React.CSSProperties} onClick={() => update(sel.id, { type: t })}>{t}</button>
            ))}
          </div>
          <div className="row">
            {sel.type === 'R-R' && (
              <label className="beats">Spans
                <Stepper v={sel.beats} set={v => update(sel.id, { beats: v })} />
                {sel.beats === 1 ? 'beat' : 'beats'}
              </label>
            )}
            {sel.kind === 'time' && (
              <button className={`btn small ${sel.march ? 'primary' : ''}`} onClick={() => { update(sel.id, { march: !sel.march }); if (tour === 2) setTour(3) }}>March out</button>
            )}
            <span className="grow" />
            <button className="btn small danger" onClick={() => remove(sel.id)}>Delete</button>
          </div>
        </div>
      ) : selM ? (
        <div className="panel">
          <div className="row">
            <b>{selM.kind === 'ste' ? 'ST' : 'Axis'} · {selM.lead}</b>
            <span className="fine">Drag any dot to adjust.</span>
            <span className="grow" />
            <button className="btn small danger" onClick={() => { setMarkers(ms => ms.filter(m => m.id !== selM.id)); setSelMarker(null) }}>Delete</button>
          </div>
          {selM.kind === 'axis' && axis.deg != null && <p className="fine">Axis {Math.round(axis.deg)}° · see Results for the classification and source.</p>}
        </div>
      ) : tour != null ? (
        <div className="panel coach tour">
          <div className="row"><b>Guided tour · {tour + 1} of {TOUR.length}</b><span className="grow" /><button className="btn small" onClick={() => setTour(null)}>End tour</button></div>
          <p>{TOUR[tour]}</p>
          <div className="row">
            {tour > 0 && <button className="btn small" onClick={() => setTour(tour - 1)}>Back</button>}
            <span className="grow" />
            {tour < TOUR.length - 1 ? <button className="btn small primary" onClick={() => setTour(tour + 1)}>Next tip</button> : <button className="btn small primary" onClick={() => setTour(null)}>Finish</button>}
          </div>
        </div>
      ) : null}

      <nav className="tools">
        <button className={`btn ${calibratedX ? '' : 'primary pulse-btn'}`} onClick={openCalBox}>{calibratedX ? '🔒 Cal' : 'Calibrate'}</button>
        <button className="btn primary" onClick={() => addCaliper('time')}>⟷ Time</button>
        <button className="btn primary" onClick={() => addCaliper('amp')}>↕ Amp</button>
        <button className="btn ste" onClick={() => startPlacing('ste')}>STE</button>
        <button className="btn" onClick={() => startPlacing('axis')}>Axis</button>
      </nav>

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
      {intro}
    </div>
  )
}

function Stepper({ v, set }: { v: number; set: (v: number) => void }) {
  return (
    <span className="stepper">
      <button className="btn small" onClick={() => set(Math.max(1, v - 1))} aria-label="Fewer">−</button>
      <b>{v}</b>
      <button className="btn small" onClick={() => set(v + 1)} aria-label="More">+</button>
    </span>
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
  if (c.type === 'R-R') return `${Math.round(rateFromSpan(v / c.beats))}/min${c.beats > 1 ? ` (${c.beats})` : ''}`
  return `${c.type} ${Math.round(v)} ms`
}

function fmt(v: number | null, dp: number, unit: string) {
  return v == null || !isFinite(v) ? '—' : `${v.toFixed(dp)}${unit}`
}
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)) }
