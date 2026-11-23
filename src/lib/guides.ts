import type { RuleId } from './references'

// Guided checks: the user answers each question from the ECG in front of them.
// The app never reads the tracing. An ending only says which written criteria
// the user's own answers match, and names the source.

export interface Ending { kind: 'end'; text: string; rule: RuleId; note?: string; next?: GuideId }
export interface Question {
  kind: 'q'
  q: string
  help?: string
  /** Key of a measured value the app can show beside the question. */
  hint?: HintKey
  yes: string | Ending
  no: string | Ending
}
export interface Choice { kind: 'choice'; q: string; help?: string; options: { label: string; to: string | Ending }[] }
export type Node = Question | Choice

export type HintKey = 'qrs' | 'rate' | 'axis' | 'rsPrecordial' | 'march'
export type GuideId = 'wide' | 'hemi' | 'wct'
export interface Guide { id: GuideId; title: string; blurb: string; start: string; nodes: Record<string, Node> }

const end = (text: string, rule: RuleId, note?: string, next?: GuideId): Ending => ({ kind: 'end', text, rule, note, next })

export const GUIDES: Record<GuideId, Guide> = {
  wide: {
    id: 'wide',
    title: 'Wide QRS: RBBB, LBBB or IVCD',
    blurb: 'Bundle branch block criteria from the course text, Chapter 13.',
    start: 'width',
    nodes: {
      width: { kind: 'q', q: 'Is the QRS 0.12 s (120 ms) or wider in at least one lead?', help: 'Measure the widest QRS you can find. One wide lead is enough.', hint: 'qrs', yes: 'tachy', no: end('Your answers do not meet the 0.12 s width that every complete bundle branch block needs.', 'rbbb', 'If the axis is off, try the hemiblock check.', 'hemi') },
      tachy: { kind: 'q', q: 'Is this a wide-complex tachycardia (rate over 100)?', hint: 'rate', yes: end('Work through VT vs SVT before calling a bundle branch block.', 'vtText', 'The course text: if it appears to be ventricular tachycardia, initiate treatment immediately.', 'wct'), no: 'slurS' },
      slurS: { kind: 'q', q: 'Is there a slurred (broad, slow) S wave in leads I and V6?', help: 'The text calls this the main criterion for RBBB.', yes: 'rsr', no: 'monoR' },
      rsr: { kind: 'q', q: 'Is V1 predominantly positive: an RSR′, rabbit ears, or a qR / QR′?', help: 'An increased R:S ratio in V1 or V2. Do not hunt for perfect rabbit ears.', yes: end('Your answers match the course text’s three criteria for RBBB.', 'rbbb', 'In RBBB, LVH can still be judged by the usual criteria; RVH cannot.'), no: end('Wide, with a slurred S in I and V6 but no increased R:S in V1: your answers match the course text’s example of an IVCD.', 'ivcd', 'The text: think electrolytes first, especially hyperkalemia.') },
      monoR: { kind: 'q', q: 'Are there broad, monomorphic R waves in I and V6, with no Q waves?', help: 'The R in V6 may be notched.', yes: 'monoS', no: end('Wide, but without the RBBB or LBBB pattern: your answers match the course text’s generalized IVCD.', 'ivcd', 'The text: think electrolytes first, especially hyperkalemia.') },
      monoS: { kind: 'q', q: 'Is V1 a broad, monomorphic S wave (a small r is allowed)?', yes: end('Your answers match the course text’s three criteria for LBBB.', 'lbbb', 'In LBBB, LVH and RVH cannot be judged. Check ST and T against concordance.'), no: end('Wide, but without the full LBBB pattern: your answers match the course text’s generalized IVCD.', 'ivcd', 'The text: think electrolytes first, especially hyperkalemia.') },
    },
  },
  hemi: {
    id: 'hemi',
    title: 'Hemiblocks (LAH, LPH)',
    blurb: 'Fascicular block criteria from the course text, Chapter 13.',
    start: 'left',
    nodes: {
      left: { kind: 'q', q: 'Is the axis between −30° and −90°?', help: 'Quick check from the text: I positive, aVF negative, and II negative.', hint: 'axis', yes: 'lahI', no: 'right' },
      lahI: { kind: 'q', q: 'Is there a qR complex or an R wave in lead I?', yes: 'lahIII', no: end('Left axis, but your answers do not meet all the LAH criteria.', 'lah') },
      lahIII: { kind: 'q', q: 'Is there an rS complex in lead III (and probably II and aVF)?', yes: end('Your answers match the course text’s criteria for left anterior hemiblock.', 'lah', 'With a QRS of 0.12 s or more and an RBBB pattern, the text calls this a bifascicular block.', 'wide'), no: end('Left axis, but your answers do not meet all the LAH criteria.', 'lah') },
      right: { kind: 'q', q: 'Is the axis between 90° and 180°?', hint: 'axis', yes: 'lphSq', no: end('The axis is not in either hemiblock range.', 'lah') },
      lphSq: { kind: 'q', q: 'Is there an s wave in lead I and a q wave in lead III?', yes: 'lphEx', no: end('Right axis, but your answers do not meet all the LPH criteria.', 'lph') },
      lphEx: { kind: 'q', q: 'Have you excluded right atrial enlargement and right ventricular hypertrophy?', help: 'RVH is the most common cause of a right axis. A P-pulmonale with right axis rules out calling LPH.', yes: end('Your answers match the course text’s criteria for left posterior hemiblock, a diagnosis of exclusion.', 'lph', 'RBBB with LPH can deteriorate to complete heart block, especially in AMI.'), no: end('LPH cannot be called while RAE or RVH may explain the right axis.', 'lph') },
    },
  },
  wct: {
    id: 'wct',
    title: 'Wide-complex tachycardia: VT vs SVT',
    blurb: 'The four Brugada steps, as in the EMS 220 handout.',
    start: 'b1',
    nodes: {
      b1: { kind: 'q', q: 'Step 1. Is there NO RS complex in any precordial lead (V1 to V6)?', help: 'All precordial complexes are R only, QR or QS, never R followed by S.', yes: end('Your answers meet Brugada step 1 for VT (sensitivity 21%, specificity 100%).', 'brugada'), no: 'b2' },
      b2: { kind: 'q', q: 'Step 2. Is the R to S interval over 100 ms in any precordial lead?', help: 'From the start of the R to the bottom of the S. Use QRS marks (QRS onset and S nadir) in each V lead.', hint: 'rsPrecordial', yes: end('Your answers meet Brugada step 2 for VT (sensitivity 66%, specificity 98%).', 'brugada'), no: 'b3' },
      b3: { kind: 'q', q: 'Step 3. Is there AV dissociation?', help: 'Tap the P waves with P-P march and the QRSs with R-R march. P waves marching through at their own rate suggest dissociation. Fusion or capture beats count too.', hint: 'march', yes: end('Your answers meet Brugada step 3 for VT (sensitivity 82%, specificity 98%).', 'brugada'), no: 'b4' },
      b4: { kind: 'choice', q: 'Step 4. What does V1 look like?', options: [{ label: 'LBBB-like: dominant S in V1 or V2', to: 'lb' }, { label: 'RBBB-like: dominant R in V1 or V2', to: 'rb' }] },
      lb: { kind: 'q', q: 'Do you see the VT morphology in V1 and V6?', help: 'V1: R wave over 30 ms, R to S over 60 ms, or a notched S. V6: a QS or qR complex.', yes: end('Your answers meet Brugada step 4 for VT (morphology).', 'brugada'), no: end('Your answers did not meet any Brugada step for VT, which the handout reads as SVT with aberrancy.', 'brugada', 'The course text lists more VT signs to check: fusion and capture beats, Josephson’s sign, and a QRS of 0.16 s or more (Ch 8, slides 33 and 35).') },
      rb: { kind: 'q', q: 'Do you see the VT morphology in V1 and V6?', help: 'V1: a smooth monophasic R, a notched downslope to the R, or a qR. V6: R:S ratio under 1, or a QS complex.', yes: end('Your answers meet Brugada step 4 for VT (morphology).', 'brugada'), no: end('Your answers did not meet any Brugada step for VT, which the handout reads as SVT with aberrancy.', 'brugada', 'The course text lists more VT signs to check: fusion and capture beats, Josephson’s sign, and a QRS of 0.16 s or more (Ch 8, slides 33 and 35).') },
    },
  },
}
