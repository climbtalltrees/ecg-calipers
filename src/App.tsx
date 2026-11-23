import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { loadFile, type LoadedImage } from './lib/loadImage'
import { straighten } from './lib/warp'
import { exportView } from './lib/exportView'
import { drawDemo } from './lib/demo'
import { isSquareOn, scaleFromBox, squareAt, type Quad } from './lib/calbox'
import { pxToMs, pxToMv, rateFromSpan, qtcBazett, qtcFridericia, type Calibration, type Point } from './lib/measure'
import { qrsFlag, qtcFlag, stFlag, axisFlag, type Flag, type Patient } from './lib/flags'
import { REFS, RULES, type Ref } from './lib/references'
import { LEADS, stDeviationMm, heightMm, netQrsMm, frontalAxis, type Lead } from './lib/leads'
import { MARK_ROLES, SKIPPABLE, markIntervals } from './lib/marks'
import { seriesStats } from './lib/rhythm'
import { rwatFlag, prFlag, pWidthFlag, pHeightFlag } from './lib/flags'
import { GuideSheet } from './components/Guide'
import { GUIDES, type GuideId, type HintKey } from './lib/guides'
import { CaliperShape, MarkerShape, CalBoxShape, StepDiagram, COLORS, type Caliper, type Marker } from './components/shapes'
import { Intro, TOUR } from './components/Intro'

const TIME_TYPES = ['R-R', 'PR', 'QRS', 'QT', 'P wave', 'Other']
const AMP_TYPES = ['P amp', 'R amp', 'S amp', 'Other']

type MKind = 'ste' | 'axis' | 'pq' | 'qrs' | 'pp' | 'rr'
type Placing = null | { kind: MKind; lead: Lead | null; pts: Point[]; roles: string[]; skipped: string[]; notch?: boolean }
const isMarks = (k: MKind): k is 'pq' | 'qrs' => k === 'pq' || k === 'qrs'
const isSeries = (k: MKind): k is 'pp' | 'rr' => k === 'pp' || k === 'rr'
const isMarkTool = (k: MKind) => isMarks(k) || isSeries(k)
const MARK_HELP: Record<string, string> = {
  'P onset': 'Tap where the P wave leaves the baseline.',
  'P end': 'Tap where the P wave returns to the baseline.',
  'QRS onset': 'Tap the first deflection of the QRS.',
  'R peak': 'Tap the peak of the R wave (for R-wave peak time).',
  'S nadir': 'Tap the deepest point of the S wave.',
  'QRS end': 'Tap where the QRS ends (the J point).',
  Notch: 'Tap the notch or slur.',
}
const KIND_NAME: Record<MKind, string> = { ste: 'ST', axis: 'Axis', pq: 'P → QRS', qrs: 'QRS marks', pp: 'P-P march', rr: 'R-R march' }
const KIND_COLOR: Record<MKind, string> = { ste: '#dc2626', axis: '#0d9488', pq: '#059669', qrs: '#db2777', pp: '#059669', rr: '#2563eb' }
const STEPS: Record<'ste' | 'axis', string[]> = {
  ste: ['Tap the baseline: a flat spot on the TP or PR segment.', 'Tap the J point: where the QRS ends and the ST segment begins.', 'Tap the tallest point of the QRS (for the ST:QRS ratio).'],
  axis: ['Tap the baseline: a flat spot before the QRS.', 'Tap the top of the R wave.', 'Tap the bottom of the S wave.'],
}
const AXIS_LEADS: Lead[] = ['I', 'aVF', 'II']

interface View { s: number; tx: number; ty: number }
interface CalBox { q: Quad; wBoxes: number; hBoxes: number }
type Drag =
  | { kind: 'caliper'; id: number; leg: 'a' | 'b' | 'bar'; last: Point }
  | { kind: 'marker'; id: number; idx: number | 'all'; last: Point }
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
  const [guide, setGuide] = useState<GuideId | null>(null)

  const vpRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startView: View; start: Map<number, { x: number; y: number }>; downAt: { x: number; y: number }; moved: boolean } | null>(null)
  const drag = useRef<Drag | null>(null)
  const aim = useRef<{ id: number } | null>(null)
  const [loupe, setLoupe] = useState<{ p: Point; sx: number; sy: number } | null>(null)
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
    // Default 25 x 25 mm (5 x 5 large boxes): big enough that a finger's error barely matters.
    const guess = cal.pxPerMmX ? cal.pxPerMmX * 12.5 : Math.min(r.width, r.height) * 0.3 / viewRef.current.s
    setCalBox({ q: squareAt(viewCenter(), guess), wBoxes: 5, hBoxes: 5 })
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
  const showLoupe = (p: Point, clientX: number, clientY: number) => {
    const r = vpRef.current!.getBoundingClientRect()
    setLoupe({ p, sx: clientX - r.left, sy: clientY - r.top })
  }
  const onVpDown = (e: RPointerEvent) => {
    // A primary pointer means no other finger is down: drop any stale entries.
    if (e.isPrimary) { pointers.current.clear(); aim.current = null }
    else if (aim.current) { aim.current = null; setLoupe(null) } // second finger: pinch instead of aiming
    if (e.isPrimary && placing?.lead) {
      // Press and slide to aim a point, with a magnifier; release to place it.
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      aim.current = { id: e.pointerId }
      showLoupe(toImage(e.clientX, e.clientY), e.clientX, e.clientY)
      gesture.current = null
      return
    }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = { startView: view, start: new Map(pointers.current), downAt: { x: e.clientX, y: e.clientY }, moved: pointers.current.size > 1 }
  }
  const onVpMove = (e: RPointerEvent) => {
    if (drag.current) return onDragMove(e)
    if (aim.current && aim.current.id === e.pointerId) { showLoupe(toImage(e.clientX, e.clientY), e.clientX, e.clientY); return }
    if (aim.current) return
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
    setLoupe(null)
    if (aim.current && aim.current.id === e.pointerId) {
      aim.current = null
      if (e.type === 'pointerup') onTap(toImage(e.clientX, e.clientY))
      return
    }
    if (drag.current) { drag.current = null; gesture.current = null; return }
    if (!gesture.current && pointers.current.size === 0) return
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
    if (placing?.lead && isSeries(placing.kind)) {
      setPlacing({ ...placing, pts: [...placing.pts, p], roles: [...placing.roles, placing.kind === 'pp' ? 'P' : 'R'] })
      return
    }
    if (placing?.lead && isMarks(placing.kind)) {
      const role = placing.notch ? 'Notch' : nextRole(placing)
      if (!role) return
      const next = { ...placing, pts: [...placing.pts, p], roles: [...placing.roles, role], notch: false }
      if (!nextRole(next)) commitMarks(next)
      else setPlacing(next)
      return
    }
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
  const startPlacing = (kind: MKind) => {
    if (!cal.pxPerMmY) { setErr('Calibrate first: fit the yellow box to the grid and tap Lock.'); openCalBox(); return }
    setCalBox(null); setSelected(null); setSelMarker(null)
    setPlacing({ kind, lead: kind === 'axis' ? nextAxisLead(markers) : null, pts: [], roles: [], skipped: [] })
  }
  const nextRole = (pl: NonNullable<Placing>): string | null => {
    if (!isMarks(pl.kind)) return null
    return MARK_ROLES[pl.kind].find(r => !pl.roles.includes(r) && !pl.skipped.includes(r)) ?? null
  }
  const commitMarks = (pl: NonNullable<Placing>) => {
    if (!pl.lead) return
    const m: Marker = { id: nextId++, kind: pl.kind, lead: pl.lead, pts: pl.pts, roles: pl.roles }
    setMarkers(ms => [...ms, m]) // several beats per lead are allowed: each is its own set
    setSelMarker(m.id)
    setPlacing({ kind: pl.kind, lead: null, pts: [], roles: [], skipped: [] })
  }
  const finishSeries = () => {
    if (!placing?.lead || placing.pts.length < 2) return
    const m: Marker = { id: nextId++, kind: placing.kind as 'pp' | 'rr', lead: placing.lead, pts: [...placing.pts].sort((a, b) => a.x - b.x), roles: placing.roles }
    setMarkers(ms => [...ms, m]); setSelMarker(m.id)
    setPlacing(null)
  }
  const undoTap = () => {
    if (!placing || !placing.pts.length) return
    setPlacing({ ...placing, pts: placing.pts.slice(0, -1), roles: placing.roles.slice(0, -1) })
  }
  const skipRole = () => {
    if (!placing) return
    const r = nextRole(placing)
    if (!r) return
    const next = { ...placing, skipped: [...placing.skipped, r] }
    if (!nextRole(next)) commitMarks(next); else setPlacing(next)
  }
  /** Copies a mark set one beat over so it can be dragged onto the next complex. */
  const duplicateMarks = (m: Marker) => {
    const rr = calipers.filter(x => x.type === 'R-R' && x.band)
    const xs = m.pts.map(p => p.x)
    const step = rr.length ? rr.reduce((s, x) => s + Math.abs(x.b.x - x.a.x) / x.beats, 0) / rr.length : 2 * (Math.max(...xs) - Math.min(...xs))
    const copy: Marker = { ...m, id: nextId++, pts: m.pts.map(p => ({ x: p.x + step, y: p.y })) }
    setMarkers(ms => [...ms, copy]); setSelMarker(copy.id)
  }
  const commitPlacing = (pts: Point[]) => {
    if (!placing?.lead) return
    const { lead, kind } = placing
    const m: Marker = { id: nextId++, kind, lead, pts }
    const ms = [...markers.filter(x => !(x.kind === kind && x.lead === lead)), m]
    const blank = { pts: [], roles: [], skipped: [] }
    setMarkers(ms)
    setSelMarker(m.id)
    if (kind === 'axis') {
      const next = nextAxisLead(ms)
      setPlacing(next ? { kind, lead: next, ...blank } : null)
      if (!next && tour === 5) setSheet(true)
    } else {
      setPlacing({ kind, lead: null, ...blank }) // back to the lead list for the next lead
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
    // One live caliper per kind: tapping the tool again brings it to the middle of the view.
    const existing = calipers.find(x => x.kind === kind && !x.band)
    const cp: Caliper = kind === 'time'
      ? { id: existing?.id ?? nextId++, kind, type: existing?.type ?? 'R-R', a: { x: c.x - half, y: c.y }, b: { x: c.x + half, y: c.y }, beats: existing?.beats ?? 1, march: false, band: false }
      : { id: existing?.id ?? nextId++, kind, type: existing?.type ?? 'R amp', a: { x: c.x, y: c.y - half }, b: { x: c.x, y: c.y + half }, beats: 1, march: false, band: false }
    setCalipers(cs => [...cs.filter(x => x.id !== cp.id), cp])
    setSelected(cp.id); setSelMarker(null); setHint(null)
  }
  const update = (id: number, patch: Partial<Caliper>) => setCalipers(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)))
  const remove = (id: number) => { setCalipers(cs => cs.filter(c => c.id !== id)); setSelected(null) }
  const [hint, setHint] = useState<string | null>(null)
  /** Leaves a permanent band where the live caliper is; the caliper stays live for the next one. */
  const setBand = (c: Caliper) => {
    const band: Caliper = { ...c, id: nextId++, band: true, march: false }
    setCalipers(cs => [...cs, band])
    const n = calipers.filter(x => x.band && x.type === c.type).length + 1
    if (tour === 1 && c.type === 'R-R') setTour(2)
    if (tour === 3 && c.type !== 'R-R') setTour(4)
    setHint(`${c.type} band ${n} set. Drag the caliper to the next ${c.type === 'R-R' ? 'pair of R waves' : 'one'} and set again.`)
  }
  /** Copies a band one beat over (one measured R-R if there is one), ready to drag. */
  const duplicate = (c: Caliper) => {
    const rr = calipers.filter(x => x.type === 'R-R' && x.band)
    const step = rr.length ? rr.reduce((s, x) => s + Math.abs(x.b.x - x.a.x) / x.beats, 0) / rr.length : 2 * Math.abs(c.b.x - c.a.x)
    const copy: Caliper = { ...c, id: nextId++, a: { ...c.a, x: c.a.x + step }, b: { ...c.b, x: c.b.x + step }, march: false }
    setCalipers(cs => [...cs, copy])
    setSelected(copy.id)
  }

  const startDrag = (e: RPointerEvent, d: Drag) => {
    e.stopPropagation()
    vpRef.current!.setPointerCapture(e.pointerId)
    drag.current = d
  }
  const onCaliperDown = (e: RPointerEvent, id: number, leg: 'a' | 'b' | 'bar') => {
    startDrag(e, { kind: 'caliper', id, leg, last: toImage(e.clientX, e.clientY) })
    setSelected(id); setSelMarker(null)
  }
  const onMarkerDown = (e: RPointerEvent, id: number, idx: number | 'all') => {
    startDrag(e, { kind: 'marker', id, idx, last: toImage(e.clientX, e.clientY) })
    setSelMarker(id); setSelected(null)
  }
  const onDragMove = (e: RPointerEvent) => {
    const d = drag.current!
    const p = toImage(e.clientX, e.clientY)
    const dx = p.x - d.last.x, dy = p.y - d.last.y
    d.last = p
    // Magnifier on the exact point being moved, so the finger never hides it.
    let focus = p
    if (d.kind === 'box' && d.corner !== 'move' && calBox) focus = { x: calBox.q[d.corner].x + dx, y: calBox.q[d.corner].y + dy }
    if (d.kind === 'marker' && d.idx !== 'all') { const m = markers.find(x => x.id === d.id); const i = d.idx; if (m) focus = { x: m.pts[i].x + dx, y: m.pts[i].y + dy } }
    if (d.kind === 'caliper' && d.leg !== 'bar') {
      const c = calipers.find(x => x.id === d.id)
      if (c) focus = c.kind === 'time' ? { x: c[d.leg].x + dx, y: p.y } : { x: p.x, y: c[d.leg].y + dy }
    }
    showLoupe(focus, e.clientX, e.clientY)
    if (d.kind === 'box') {
      setCalBox(b => b && ({ ...b, q: b.q.map((q, i) => (d.corner === 'move' || d.corner === i) ? { x: q.x + dx, y: q.y + dy } : q) as Quad }))
      return
    }
    if (d.kind === 'marker') {
      setMarkers(ms => ms.map(m => m.id !== d.id ? m : { ...m, pts: m.pts.map((q, i) => (d.idx === 'all' || i === d.idx) ? { x: q.x + dx, y: q.y + (d.idx === 'all' ? dy : (isMarks(m.kind) ? 0 : dy)) } : q) }))
      return
    }
    setCalipers(cs => cs.map(c => {
      if (c.id !== d.id) return c
      const mv = (q: Point) => ({ x: q.x + dx, y: q.y + dy })
      if (d.leg === 'bar') return c.band && c.kind === 'time'
        ? { ...c, a: { x: c.a.x + dx, y: c.a.y }, b: { x: c.b.x + dx, y: c.b.y } }
        : { ...c, a: mv(c.a), b: mv(c.b) }
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
    // Set bands are the measurements; the live caliper counts only until a band of that type exists.
    const of = (t: string) => { const b = calipers.filter(c => c.type === t && c.band); return b.length ? b : calipers.filter(c => c.type === t) }
    const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
    const val = (t: string) => mean(of(t).map(valueOf).filter((v): v is number => v != null))
    const rrMs = calibratedX ? mean(of('R-R').map(c => pxToMs(c.b.x - c.a.x, fullCal) / c.beats)) : null
    const qt = val('QT')
    const r = val('R amp'), s = val('S amp')
    return {
      rate: rrMs ? rateFromSpan(rrMs) : null, rrMs,
      pr: val('PR'), qrs: val('QRS'), qt, pw: val('P wave'),
      qtcB: qt && rrMs ? qtcBazett(qt, rrMs) : null,
      qtcF: qt && rrMs ? qtcFridericia(qt, rrMs) : null,
      pAmp: val('P amp'), rAmp: r, sAmp: s, rs: r && s ? r / s : null,
      spread: (t: string) => {
        const vs = of(t).map(c => (t === 'R-R' ? (valueOf(c) ?? NaN) / c.beats : valueOf(c))).filter((v): v is number => v != null && isFinite(v))
        if (vs.length < 2) return undefined
        return `${vs.length} measured · ${Math.round(Math.min(...vs))}–${Math.round(Math.max(...vs))} ms`
      },
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

  const seriesRows = useMemo(() => {
    if (!cal.pxPerMmX) return []
    return markers.filter(m => isSeries(m.kind)).map(m => {
      const st = seriesStats(m.pts.map(p => p.x), fullCal)!
      const drift = Math.max(...st.deviation.map(Math.abs))
      return {
        key: `s${m.id}`, k: `${m.lead} · ${m.kind === 'pp' ? 'P-P' : 'R-R'} (${m.pts.length} beats)`,
        v: `${Math.round(st.rate)}/min`,
        sub: `mean ${Math.round(st.mean)} ms · ${Math.round(st.min)}–${Math.round(st.max)} ms · spread ${Math.round(st.spread)} ms · max drift ${Math.round(drift)} ms`,
      }
    })
  }, [markers, cal.pxPerMmX, fullCal])

  // Marked complexes, averaged per lead and interval across every set the user marked.
  const markRows = useMemo(() => {
    if (!cal.pxPerMmX) return []
    const groups = new Map<string, { lead: Lead; label: string; key: string; ms: number[] }>()
    for (const m of markers) {
      if (!isMarks(m.kind)) continue
      for (const r of markIntervals(m.kind, m.roles ?? [], m.pts, fullCal)) {
        const id = `${m.lead}|${r.key}|${r.label}`
        const g = groups.get(id) ?? { lead: m.lead, label: r.label, key: r.key, ms: [] }
        g.ms.push(r.ms); groups.set(id, g)
      }
    }
    return [...groups.values()]
      .sort((a, b) => LEADS.indexOf(a.lead) - LEADS.indexOf(b.lead))
      .map(g => {
        const mean = g.ms.reduce((a, b) => a + b, 0) / g.ms.length
        const flag = g.key === 'rwat' ? rwatFlag(g.lead, mean) : g.key === 'qrs' ? qrsFlag(mean) : g.key === 'pr' ? prFlag(mean) : g.key === 'pDur' ? pWidthFlag(g.lead, mean) : null
        return {
          key: `${g.lead}${g.key}${g.label}`, k: `${g.lead} · ${g.label}`, v: `${Math.round(mean)} ms`, flag,
          sub: g.ms.length > 1 ? `${g.ms.length} beats · ${Math.round(Math.min(...g.ms))}–${Math.round(Math.max(...g.ms))} ms` : undefined,
        }
      })
  }, [markers, cal.pxPerMmX, fullCal])

  // Measured values shown beside guided-check questions. Numbers only.
  const hints = useMemo(() => {
    const h: Partial<Record<HintKey, string>> = {}
    const qrsMarks: string[] = [], rs: string[] = []
    for (const m of markers) {
      if (m.kind !== 'qrs' || !cal.pxPerMmX) continue
      for (const r of markIntervals('qrs', m.roles ?? [], m.pts, fullCal)) {
        if (r.key === 'qrs') qrsMarks.push(`${m.lead} ${Math.round(r.ms)} ms`)
        if (r.key === 'rs' && m.lead.startsWith('V')) rs.push(`${m.lead} ${Math.round(r.ms)} ms`)
      }
    }
    const qrsParts = [results.qrs != null ? `QRS caliper ${Math.round(results.qrs)} ms` : null, ...qrsMarks].filter(Boolean)
    if (qrsParts.length) h.qrs = qrsParts.join(' · ')
    if (results.rate != null) h.rate = `${Math.round(results.rate)}/min`
    if (axis.deg != null) h.axis = `${axis.deg >= 0 ? '+' : '−'}${Math.abs(Math.round(axis.deg))}°`
    if (rs.length) h.rsPrecordial = `onset to S nadir: ${rs.join(' · ')}`
    if (seriesRows.length) h.march = seriesRows.map(r => `${r.k}: ${r.v}`).join(' · ')
    return h
  }, [markers, cal.pxPerMmX, fullCal, results.qrs, results.rate, axis.deg, seriesRows])

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
            {/* Live calipers draw last so a band just set underneath never steals the grab. */}
            {[...calipers].sort((x, y) => Number(y.band) - Number(x.band)).map(c => (
              <CaliperShape key={c.id} c={c} hs={hs} h={img.h} w={img.w} selected={c.id === selected} label={labelFor(c, valueOf(c))} onDown={onCaliperDown} />
            ))}
            {cal.pxPerMmY && markers.map(m => (
              <MarkerShape key={m.id} m={m} hs={hs} pxPerMmY={cal.pxPerMmY!} selected={m.id === selMarker} onDown={onMarkerDown}
                intervals={isMarks(m.kind) && cal.pxPerMmX ? markIntervals(m.kind, m.roles ?? [], m.pts, fullCal) : undefined}
                series={isSeries(m.kind) && cal.pxPerMmX ? seriesStats(m.pts.map(p => p.x), fullCal) : undefined} w={img.w}
                live={null} />
            ))}
            {placing?.lead && isSeries(placing.kind) && placing.pts.length > 0 && cal.pxPerMmY ? (
              <MarkerShape m={{ id: -1, kind: placing.kind, lead: placing.lead, pts: [...placing.pts].sort((a, b) => a.x - b.x), roles: placing.roles }} hs={hs} pxPerMmY={cal.pxPerMmY} selected
                onDown={() => {}} series={cal.pxPerMmX ? seriesStats(placing.pts.map(p => p.x), fullCal) : undefined} w={img.w} live={true} />
            ) : placing?.pts.map((p, i) => <circle key={`p${i}`} cx={p.x} cy={p.y} r={6 * hs} className="calpt" />)}
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
        {loupe && <Loupe img={img} p={loupe.p} sx={loupe.sx} sy={loupe.sy} view={view} vp={vpRef.current} />}
        <div className="zoom" onPointerDown={e => e.stopPropagation()}>
          <button className="btn round" onClick={() => zoomBy(1.4)} aria-label="Zoom in">+</button>
          <button className="btn round" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
          <button className="btn round" onClick={fit} aria-label="Fit">⤢</button>
        </div>
      </div>

      {calBox ? (
        <div className="panel coach">
          <b>Calibrate: fit the yellow box to the grid</b>
          <p className="fine">Drag each corner onto a heavy grid-line crossing. The magnifier shows exactly where the corner is. Drag an edge to move the whole box.</p>
          <div className="row">
            <span>Size</span>
            <button className={`btn small ${calBox.wBoxes === 5 && calBox.hBoxes === 5 ? 'primary' : ''}`} onClick={() => setCalBox({ ...calBox, wBoxes: 5, hBoxes: 5 })}>25 × 25 mm</button>
            <button className={`btn small ${calBox.wBoxes === 10 && calBox.hBoxes === 10 ? 'primary' : ''}`} onClick={() => setCalBox({ ...calBox, wBoxes: 10, hBoxes: 10 })}>50 × 50 mm</button>
          </div>
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
          <div className="row"><b>{KIND_NAME[placing.kind]}: pick a lead</b><span className="grow" /><button className="btn small" onClick={() => setPlacing(null)}>Done</button></div>
          {isMarkTool(placing.kind) && (
            <div className="seg">
              <button className={placing.kind === 'pq' ? 'on' : ''} onClick={() => setPlacing({ ...placing, kind: 'pq' })}>P → QRS<small>P duration · PR</small></button>
              <button className={placing.kind === 'qrs' ? 'on' : ''} onClick={() => setPlacing({ ...placing, kind: 'qrs' })}>QRS<small>onset · R peak · S · notches</small></button>
              <button className={placing.kind === 'pp' ? 'on' : ''} onClick={() => setPlacing({ ...placing, kind: 'pp' })}>P-P march<small>tap every P wave</small></button>
              <button className={placing.kind === 'rr' ? 'on' : ''} onClick={() => setPlacing({ ...placing, kind: 'rr' })}>R-R march<small>tap every R wave</small></button>
            </div>
          )}
          <div className="chips wrap">
            {(placing.kind === 'axis' ? AXIS_LEADS : [...LEADS]).map(l => {
              const done = markers.some(m => m.kind === placing.kind && m.lead === l)
              return <button key={l} className={`chip ${done ? 'on' : ''}`} style={{ '--c': KIND_COLOR[placing.kind] } as React.CSSProperties}
                onClick={() => setPlacing({ ...placing, lead: l })}>{done ? '✓ ' : ''}{l}</button>
            })}
          </div>
          <p className="fine">{placing.kind === 'ste' ? 'Measure each lead you want to check. A ✓ lead can be redone.' : placing.kind === 'axis' ? 'Lead II is optional and refines the result.' : 'You can mark several beats in the same lead; each becomes its own set.'}</p>
        </div>
      ) : placing?.lead && isSeries(placing.kind) ? (
        <div className="panel coach">
          <div className="row">
            <b>{KIND_NAME[placing.kind]} · lead {placing.lead} · {placing.pts.length} tapped</b>
            <span className="grow" />
            <button className="btn small" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
          <p className="stepText">Tap every {placing.kind === 'pp' ? 'P wave (including any hidden in a QRS or T wave)' : 'R wave'} across the strip, left to right.</p>
          <p className="fine">The first two taps set the interval; it is marched out across the strip so you can see whether each later {placing.kind === 'pp' ? 'P' : 'R'} lands on its mark. Do P-P and R-R in the same lead to compare them.</p>
          <div className="row">
            {placing.pts.length > 0 && <button className="btn small" onClick={undoTap}>Undo tap</button>}
            <span className="grow" />
            <button className="btn primary" disabled={placing.pts.length < 2} onClick={finishSeries}>Finish</button>
          </div>
        </div>
      ) : placing?.lead && isMarks(placing.kind) ? (
        <div className="panel coach">
          <div className="row">
            <b>{KIND_NAME[placing.kind]} · lead {placing.lead}</b>
            <span className="grow" />
            <button className="btn small" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
          <div className="markSteps">
            {MARK_ROLES[placing.kind].map(r => {
              const st = placing.roles.includes(r) ? 'done' : placing.skipped.includes(r) ? 'skip' : (!placing.notch && nextRole(placing) === r) ? 'now' : ''
              return <span key={r} className={st}>{st === 'done' ? '✓ ' : ''}{r}</span>
            })}
            {placing.roles.filter(r => r === 'Notch').map((_, i) => <span key={`n${i}`} className="done">✓ Notch</span>)}
          </div>
          <p className="stepText">{MARK_HELP[placing.notch ? 'Notch' : nextRole(placing) ?? '']}</p>
          <p className="fine">Press and slide to aim with the magnifier, then lift to place. Use two fingers to move around.</p>
          <div className="row">
            {placing.pts.length > 0 && <button className="btn small" onClick={undoTap}>Undo tap</button>}
            {placing.kind === 'qrs' && placing.roles.includes('QRS onset') && !placing.notch && <button className="btn small" onClick={() => setPlacing({ ...placing, notch: true })}>+ Notch</button>}
            <span className="grow" />
            {!placing.notch && SKIPPABLE.has(nextRole(placing) ?? '') && <button className="btn small primary" onClick={skipRole}>No {nextRole(placing)}</button>}
          </div>
        </div>
      ) : placing?.lead ? (
        <div className="panel coach">
          <div className="row">
            <b>{KIND_NAME[placing.kind]} · lead {placing.lead} · step {placing.pts.length + 1} of 3</b>
            <span className="grow" />
            <button className="btn small" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
          <div className="steprow">
            <StepDiagram kind={placing.kind as 'ste' | 'axis'} step={placing.pts.length} />
            <div>
              <p className="stepText">{STEPS[placing.kind as "ste" | "axis"][placing.pts.length]}</p>
              <p className="fine">Press and slide to aim with the magnifier, then lift to place. Use two fingers to move around.</p>
            </div>
          </div>
          <div className="row">
            {placing.pts.length > 0 && <button className="btn small" onClick={undoTap}>Undo tap</button>}
            <span className="grow" />
            {placing.pts.length === 2 && <button className="btn small primary" onClick={skipLast}>{placing.kind === 'axis' ? 'No S wave' : 'Skip this step'}</button>}
          </div>
        </div>
      ) : sel ? (
        <div className="panel">
          {sel.band
            ? <p className="fine">{sel.type} band. Drag inside it to move it, or drag an edge to adjust it.</p>
            : <p className="fine">{hint ?? 'Drag the legs onto the interval, choose what it is, then tap Set band to leave it on the strip.'}</p>}
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
            {sel.band && <button className="btn small" onClick={() => duplicate(sel)}>Duplicate</button>}
            <span className="grow" />
            <button className="btn small danger" onClick={() => remove(sel.id)}>Delete</button>
            {!sel.band && <button className="btn primary" onClick={() => setBand(sel)}>✓ Set band</button>}
          </div>
        </div>
      ) : selM ? (
        <div className="panel">
          <div className="row">
            <b>{KIND_NAME[selM.kind]} · {selM.lead}</b>
            <span className="fine">{isMarks(selM.kind) ? 'Drag a mark to adjust, or the label to move the set.' : 'Drag any dot to adjust.'}</span>
            <span className="grow" />
            {isMarks(selM.kind) && <button className="btn small" onClick={() => duplicateMarks(selM)}>Duplicate</button>}
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
        <button className="btn" onClick={() => startPlacing('pq')}>Marks</button>
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
            <div className="guides">
              <h3>Guided checks</h3>
              <p className="fine">Step-by-step criteria from your course text and the Brugada steps. You answer each question.</p>
              {(Object.keys(GUIDES) as GuideId[]).map(id => <button key={id} className="btn" onClick={() => { setSheet(false); setGuide(id) }}>{GUIDES[id].title}</button>)}
            </div>
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
                <Row k="Heart rate" v={fmt(results.rate, 0, '/min')} sub={results.rrMs ? `R-R ${fmt(results.rrMs, 0, ' ms')}${results.spread('R-R') ? ` · ${results.spread('R-R')}` : ''}` : undefined} />
                <Row k="PR" v={fmt(results.pr, 0, ' ms')} sub={results.spread('PR')} flag={prFlag(results.pr)} />
                <Row k="QRS" v={fmt(results.qrs, 0, ' ms')} sub={results.spread('QRS')} flag={qrsFlag(results.qrs)} />
                <Row k="QT" v={fmt(results.qt, 0, ' ms')} sub={results.spread('QT')} />
                <Row k="QTc (Bazett)" v={fmt(results.qtcB, 0, ' ms')} flag={qtcFlag(results.qtcB, patient)} />
                <Row k="QTc (Fridericia)" v={fmt(results.qtcF, 0, ' ms')} flag={qtcFlag(results.qtcF, patient)} />
                <Row k="P wave width" v={fmt(results.pw, 0, ' ms')} sub={results.spread('P wave')} flag={pWidthFlag(null, results.pw)} />
                <Row k="P amplitude" v={fmt(results.pAmp, 2, ' mV')} sub={results.pAmp != null ? `${(results.pAmp * (cal.gainMmPerMv ?? 10)).toFixed(1)} mm` : undefined} flag={pHeightFlag(results.pAmp != null ? results.pAmp * (cal.gainMmPerMv ?? 10) : null)} />
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
            {seriesRows.length > 0 && (
              <>
                <h3>Rhythm (tapped beats)</h3>
                <table><tbody>
                  {seriesRows.map(r => <Row key={r.key} k={r.k} v={r.v} sub={r.sub} />)}
                </tbody></table>
                <p className="fine">Numbers only: the spread is the longest minus the shortest interval, and drift is how far the furthest beat sits from where the first interval marches out. Whether that is regular is your call.</p>
              </>
            )}
            {markRows.length > 0 && (
              <>
                <h3>Marked complexes</h3>
                <table><tbody>
                  {markRows.map(r => <Row key={r.key} k={r.k} v={r.v} sub={r.sub} flag={r.flag} />)}
                </tbody></table>
              </>
            )}
            <h3>Frontal QRS axis</h3>
            <table><tbody>
              <Row k="Axis" v={axis.deg == null ? '—' : `${axis.deg >= 0 ? '+' : '−'}${Math.abs(Math.round(axis.deg))}°`}
                flag={axisFlag(axis.deg)}
                sub={Object.keys(axis.nets).length ? (Object.entries(axis.nets) as [Lead, number][]).map(([l, v]) => `${l} ${v >= 0 ? '+' : ''}${v.toFixed(1)} mm`).join(' · ') : 'Use Axis to measure leads I and aVF'} />
            </tbody></table>
            <p className="fine">Values come only from points you placed. Flags are for adults (over 16) and compare each value with the cited guideline or, where marked “Course text”, your EMS 220 text; tap a flag to see the source's words. They are reference marks, not a diagnosis. The ST flags look at one lead at a time: contiguous-lead criteria are yours to apply. Part IV recommends regression-based QT correction over Bazett; Bazett and Fridericia are shown side by side for comparison.</p>
            <h3>Sources</h3>
            {(Object.values(REFS) as Ref[]).map(r => <p key={r.id} className="fine">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.citation}</a> : r.citation}</p>)}
            <button className="btn primary" onClick={() => setSheet(false)}>Done</button>
          </div>
        </div>
      )}
      {guide && <GuideSheet key={guide} id={guide} hints={hints} onClose={() => setGuide(null)} onOpen={setGuide} />}
      {intro}
    </div>
  )
}

/** A magnifier above the finger, centred on the point being placed or moved. */
function Loupe({ img, p, sx, sy, view, vp }: { img: LoadedImage; p: Point; sx: number; sy: number; view: View; vp: HTMLDivElement | null }) {
  const size = 132
  const z = Math.max(view.s * 3, 2)
  const W = vp?.clientWidth ?? 400
  // Sit above the finger; flip below it near the top edge.
  const left = Math.min(Math.max(sx - size / 2, 4), W - size - 4)
  const top = sy - size - 48 < 4 ? sy + 48 : sy - size - 48
  return (
    <div className="loupe" style={{
      left, top, width: size, height: size,
      backgroundImage: `url(${img.src})`,
      backgroundSize: `${img.w * z}px ${img.h * z}px`,
      backgroundPosition: `${size / 2 - p.x * z}px ${size / 2 - p.y * z}px`,
    }}>
      <span className="cross h" /><span className="cross v" />
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
            {flag.text} <span className="src">· {REFS[rule.ref].short}, {rule.page}</span>
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
