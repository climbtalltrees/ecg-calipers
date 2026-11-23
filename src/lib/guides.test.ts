import { describe, it, expect } from 'vitest'
import { GUIDES, type Node, type Ending } from './guides'
import { RULES } from './references'
import { prFlag, pWidthFlag, pHeightFlag } from './flags'

describe('guided checks', () => {
  it('every branch leads to an existing step or an ending with a known rule', () => {
    for (const g of Object.values(GUIDES)) {
      expect(g.nodes[g.start]).toBeTruthy()
      const targets = (n: Node) => n.kind === 'q' ? [n.yes, n.no] : n.options.map(o => o.to)
      for (const n of Object.values(g.nodes)) for (const t of targets(n)) {
        if (typeof t === 'string') expect(g.nodes[t], `${g.id} → ${t}`).toBeTruthy()
        else { expect(RULES[(t as Ending).rule]).toBeTruthy(); if (t.next) expect(GUIDES[t.next]).toBeTruthy() }
      }
    }
  })
  it('wide QRS: slurred S in I/V6 plus positive V1 ends at RBBB', () => {
    const n = GUIDES.wide.nodes
    const rsr = n.rsr
    expect(rsr.kind === 'q' && typeof rsr.yes !== 'string' && rsr.yes.rule).toBe('rbbb')
  })
})

describe('course-text flags', () => {
  it('PR: short at 110 ms and below, prolonged above 200 ms', () => {
    expect(prFlag(110)?.level).toBe('low')
    expect(prFlag(120)).toBeNull()
    expect(prFlag(200)).toBeNull()
    expect(prFlag(201)?.level).toBe('high')
  })
  it('P width: 120 ms or more in I or II', () => {
    expect(pWidthFlag('II', 119)).toBeNull()
    expect(pWidthFlag('II', 120)?.level).toBe('high')
    expect(pWidthFlag('V1', 130)?.level).toBe('info')
  })
  it('P height: over 2.5 mm', () => {
    expect(pHeightFlag(2.5)).toBeNull()
    expect(pHeightFlag(3)?.rule).toBe('pPulmonale')
  })
})
