// Every clinical threshold in the app lives here, with the document it came
// from and the sentence it was taken from. Values were read from the source
// documents on 2026-11-22 (guidelines) and 2026-11-23 (course text, Brugada
// handout). Nothing here is written from memory.

export interface Ref { id: string; short: string; citation: string; url?: string }

export const REFS = {
  partIII: {
    id: 'partIII',
    short: 'AHA/ACCF/HRS 2009, Part III',
    citation: 'Surawicz B, Childers R, Deal BJ, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram, part III: intraventricular conduction disturbances. Circulation. 2009;119:e235–e240.',
    url: 'https://doi.org/10.1161/CIRCULATIONAHA.108.191095',
  },
  partIV: {
    id: 'partIV',
    short: 'AHA/ACCF/HRS 2009, Part IV',
    citation: 'Rautaharju PM, Surawicz B, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram, part IV: the ST segment, T and U waves, and the QT interval. Circulation. 2009;119:e241–e250.',
    url: 'https://doi.org/10.1161/CIRCULATIONAHA.108.191096',
  },
  text: {
    id: 'text',
    short: 'Course text',
    citation: '12-Lead ECG: The Art of Interpretation (Jones & Bartlett), instructor lecture notes, as taught in EMS 220. Criteria are paraphrased; see the text for figures.',
  },
  brugada: {
    id: 'brugada',
    short: 'Brugada 1991',
    citation: 'Brugada P, et al. A new approach to the differential diagnosis of a regular tachycardia with a wide QRS complex. Circulation. 1991;83(5):1649–1659. PMID 2022022. Steps as laid out in the EMS 220 handout (updated 8/21/13).',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2022022/',
  },
} satisfies Record<string, Ref>

export type RefId = keyof typeof REFS

/** A threshold, its source and the source's own words. */
export interface Rule { ref: RefId; page: string; quote: string }

export const RULES = {
  qrsAdult: { ref: 'partIII', page: 'p. e235', quote: 'a QRS duration of greater than 110 ms in subjects older than 16 years of age be regarded as abnormal' },
  qrsBbb: { ref: 'partIII', page: 'p. e236–e237', quote: 'QRS duration greater than or equal to 120 ms in adults (criterion 1 for both complete RBBB and complete LBBB)' },
  qtLong: { ref: 'partIV', page: 'p. e246', quote: 'the adjusted QT of 460 ms or longer in women and 450 ms or longer in men be considered a prolonged QT interval' },
  qtShort: { ref: 'partIV', page: 'p. e246', quote: 'QT 390 ms and shorter be considered a short QT interval' },
  qtFormula: { ref: 'partIV', page: 'p. e246', quote: 'linear regression functions rather than the Bazett’s formula be used for QT-rate correction' },
  stV23: { ref: 'partIV', page: 'p. e243', quote: 'abnormal J-point elevation in V2 and V3 … 0.2 mV for men 40 years of age and older and 0.25 mV for men less than 40 years of age … adult women in V2 and V3 is 0.15 mV' },
  stOther: { ref: 'partIV', page: 'p. e243', quote: 'The threshold recommended for abnormal J-point elevation for men and women in all other standard leads is 0.1 mV' },
  stDep: { ref: 'partIV', page: 'p. e243', quote: '−0.05 as the recommended threshold value for abnormal J-point depression in leads V2 and V3 in men and women and −0.1 mV in all other leads' },
  rwatV56: { ref: 'partIII', page: 'p. e237', quote: 'Complete LBBB criterion 4: R peak time greater than 60 ms in leads V5 and V6 but normal in leads V1, V2, and V3' },
  rwatAvl: { ref: 'partIII', page: 'p. e237', quote: 'Left anterior fascicular block criterion 3: R-peak time in lead aVL of 45 ms or more' },
  axis: { ref: 'partIII', page: 'p. e236', quote: 'In adults, the normal QRS axis is considered to be within −30° and 90°. Left-axis deviation is −30° and beyond … right-axis deviation in adults is from 90° to 120° … between 120° and 180°' },
  // Course text (Brian's EMS 220 text). Used for teaching flags and guided checks.
  prRange: { ref: 'text', page: 'Ch 10, slide 12', quote: 'A normal PR interval is 0.12 to 0.20 seconds in length. A PR interval is considered short if it is less than or equal to 0.11 seconds, and prolonged if it is more than 0.20 seconds.' },
  prShort: { ref: 'text', page: 'Ch 10, slides 12 and 15', quote: 'A normal PR interval is 0.12 to 0.20 seconds in length. … Three major mechanisms may cause a short PR interval: retrograde junctional P waves, Lown-Ganong-Levine (LGL) syndrome, Wolff-Parkinson-White (WPW) pattern and syndrome.' },
  pMitrale: { ref: 'text', page: 'Ch 9, slides 10 and 12', quote: 'P-mitrale is greater than 0.12 seconds in the limb leads (I and II) and notched (M-shaped). The space between the humps of the “M” should be greater than or equal to 0.04 seconds.' },
  pPulmonale: { ref: 'text', page: 'Ch 9, slide 14', quote: 'P-pulmonale is a peaked, teepee-shaped P wave that is usually more than 2.5 mm high in the limb leads.' },
  rbbb: { ref: 'text', page: 'Ch 13, slides 8 and 13', quote: 'QRS ≥ 0.12 seconds in at least one lead; slurred S wave in leads I and V6; RSR′ pattern in V1 (predominantly positive).' },
  lbbb: { ref: 'text', page: 'Ch 13, slide 24', quote: 'Duration ≥ 0.12 seconds; broad, monomorphic R waves in leads I and V6, with no Q waves; broad, monomorphic S waves in V1 (may have a small r wave).' },
  ivcd: { ref: 'text', page: 'Ch 13, slides 28 and 31', quote: 'A generalized IVCD has QRS complexes ≥ 0.12 seconds without all of the characteristics of LBBB or RBBB. First thought: an electrolyte abnormality, especially hyperkalemia.' },
  lah: { ref: 'text', page: 'Ch 13, slide 38', quote: 'Left axis deviation with the axis at −30° to −90°; a qR complex or an R wave in lead I; an rS complex in lead III, and probably also in II and aVF.' },
  lph: { ref: 'text', page: 'Ch 13, slides 42 and 43', quote: 'An axis of 90° to 180°; an s wave in lead I and a q wave in lead III; exclusion of RAE and/or RVH. LPH is a diagnosis of exclusion.' },
  vtText: { ref: 'text', page: 'Ch 8, slides 33 and 35', quote: 'Fusion and capture beats; Brugada’s sign (R to the bottom of the S ≥ 0.10 second); Josephson’s sign (notching near the low point of the S); QRS ≥ 0.16 second; AV dissociation; negative complexes in all precordial leads.' },
  brugada: { ref: 'brugada', page: 'EMS 220 handout', quote: '1: no RS complex in any precordial lead → VT. 2: R to S interval > 100 ms in one precordial lead → VT. 3: AV dissociation → VT. 4: VT morphology criteria in V1–V2 and V6 → VT; otherwise SVT with aberrancy.' },
} satisfies Record<string, Rule>

export type RuleId = keyof typeof RULES
