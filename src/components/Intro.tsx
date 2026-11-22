import { useState } from 'react'

const SLIDES = [
  { h: 'Measure real ECGs', p: 'Take a photo of a strip or 12-lead, or open an image or PDF. Your ECG stays on this device.' },
  { h: 'Calibrate once', p: 'Drag the yellow box over one large square (5 × 5 mm) and tap Lock. After that, zoom and pan freely: the calibration stays with the image.' },
  { h: 'Measure intervals', p: 'Add a Time caliper and set it to R-R, PR, QRS or QT. Each interval stays on the strip as a coloured band. March out repeats it across every beat so you can see whether it holds.' },
  { h: 'STE and axis, step by step', p: 'Pick a lead and the app walks you through each tap: baseline, J point, QRS. You place every point; flags show the guideline they come from. You make the call.' },
]

export function Intro({ onDemo, onClose }: { onDemo: () => void; onClose: () => void }) {
  const [i, setI] = useState(0)
  const last = i === SLIDES.length - 1
  return (
    <div className="sheet-bg">
      <div className="sheet intro">
        <div className="dots">{SLIDES.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
        <h2>{SLIDES[i].h}</h2>
        <p>{SLIDES[i].p}</p>
        <div className="row">
          {i > 0 ? <button className="btn" onClick={() => setI(i - 1)}>Back</button> : <button className="btn" onClick={onClose}>Skip</button>}
          <span className="grow" />
          {last
            ? <button className="btn primary" onClick={onDemo}>Try the demo strip</button>
            : <button className="btn primary" onClick={() => setI(i + 1)}>Next</button>}
        </div>
        {last && <button className="btn ghost" onClick={onClose}>I'll use my own ECG</button>}
      </div>
    </div>
  )
}

export const TOUR = [
  'This is a practice strip (synthetic, not a patient). First calibrate: drag the yellow box corners onto one large square, then tap Lock.',
  'Tap ⟷ Time. Drag one leg to an R wave peak and the other to the next R peak. The band is your R-R; the label shows the rate.',
  'With the caliper selected, tap March out. The band repeats across the strip: every R should land on a band edge if the rhythm is regular.',
  'Add another Time caliper and choose QT. Set it from the start of the QRS to the end of the T wave. Results will show QTc.',
  'Tap STE, pick V2, and follow the steps: baseline, J point, top of the QRS. This strip has ST elevation in V2.',
  'Tap Axis: do lead I, then aVF. Then open Results to see every number, its flag and the guideline it comes from.',
]
