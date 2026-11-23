import { useState } from 'react'
import { GUIDES, type GuideId, type HintKey, type Ending, type Node } from '../lib/guides'
import { REFS, RULES } from '../lib/references'

/** One guided check. The user answers every step; the app only follows their answers. */
export function GuideSheet({ id, hints, onClose, onOpen }: {
  id: GuideId
  hints: Partial<Record<HintKey, string>>
  onClose: () => void
  onOpen: (id: GuideId) => void
}) {
  const g = GUIDES[id]
  const [path, setPath] = useState<{ node: string; answer?: string }[]>([{ node: g.start }])
  const [ending, setEnding] = useState<Ending | null>(null)
  const cur = path[path.length - 1]
  const node: Node = g.nodes[cur.node]

  const go = (answer: string, to: string | Ending) => {
    const done = [...path.slice(0, -1), { node: cur.node, answer }]
    if (typeof to === 'string') setPath([...done, { node: to }])
    else { setPath(done); setEnding(to) }
  }
  const back = () => {
    if (ending) { setEnding(null); setPath(p => [...p.slice(0, -1), { node: p[p.length - 1].node }]); return }
    if (path.length > 1) setPath(p => { const q = p.slice(0, -1); return [...q.slice(0, -1), { node: q[q.length - 1].node }] })
  }
  const rule = ending ? RULES[ending.rule] : null

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet guide" onClick={e => e.stopPropagation()}>
        <h2>{g.title}</h2>
        <p className="fine">{g.blurb} You answer each step from the ECG; the app does not read the tracing.</p>
        <ol className="trail">
          {path.filter(s => s.answer).map((s, i) => <li key={i}>{qText(g.nodes[s.node])} <b>{s.answer}</b></li>)}
        </ol>
        {!ending && (
          <div className="ask">
            <p className="stepText">{qText(node)}</p>
            {node.help && <p className="fine">{node.help}</p>}
            {node.kind === 'q' && node.hint && hints[node.hint] && <p className="measured">You measured: {hints[node.hint]}</p>}
            <div className="row">
              {node.kind === 'q'
                ? <><button className="btn primary grow" onClick={() => go('Yes', node.yes)}>Yes</button><button className="btn grow" onClick={() => go('No', node.no)}>No</button></>
                : node.options.map(o => <button key={o.label} className="btn grow" onClick={() => go(o.label, o.to)}>{o.label}</button>)}
            </div>
          </div>
        )}
        {ending && rule && (
          <div className="ending">
            <p className="stepText">{ending.text}</p>
            {ending.note && <p className="fine">{ending.note}</p>}
            <p className="fine"><b>{REFS[rule.ref].short}, {rule.page}:</b> <q>{rule.quote}</q></p>
            <p className="fine">This follows your answers only. It is a teaching aid, not a diagnosis.</p>
            {ending.next && <button className="btn" onClick={() => onOpen(ending.next!)}>Next: {GUIDES[ending.next].title}</button>}
          </div>
        )}
        <div className="row">
          <button className="btn ghost" onClick={back} disabled={path.length < 2 && !ending}>Back</button>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function qText(n: Node) { return n.q }
