import { useState } from 'react'

const SLIDES = [
  { h: 'Measure real ECGs', p: 'Take a photo of a strip or 12-lead, or open an image or PDF. Your ECG stays on this device.' },
  { h: 'Calibrate once', p: 'Drag the corners of the yellow box onto a 25 × 25 mm block of the grid (5 × 5 large squares). A magnifier shows what is under your finger. Tap Lock, and the calibration stays with the image however you zoom.' },
  { h: 'Measure intervals', p: 'Drag the Time caliper onto an interval, pick R-R, PR, QRS or QT, and tap Set band. The band stays on the strip in its own colour, and the caliper is free for the next one. Bands can be moved, duplicated or marched out across every beat.' },
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
  'This is a practice strip (synthetic, not a patient). First calibrate: drag the yellow box corners onto a 5 × 5 block of large squares, then tap Lock.',
  'Tap ⟷ Time. Drag one leg to an R wave peak and the other to the next R peak, then tap ✓ Set band. The band stays; drag the caliper to the next pair and set it again.',
  'Tap a band\'s label to select it, then tap March out: the column repeats across the strip, and every R should land on an edge if the rhythm is regular. Duplicate copies it one beat over.',
  'On the caliper, choose PR, QRS or QT and set a band for each. Every type has its own colour, and Results averages the bands and shows their range.',
  'Tap STE, pick V2, and follow the steps: baseline, J point, top of the QRS. This strip has ST elevation in V2.',
  'Tap Axis: do lead I, then aVF. Then open Results to see every number, its flag and the guideline it comes from.',
]
