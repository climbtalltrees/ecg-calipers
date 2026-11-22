// Every clinical threshold in the app lives here, with the document it came
// from and the sentence it was taken from. Values were read from the source
// documents on 2026-11-22. Nothing here is written from memory.

export interface Ref { id: string; short: string; citation: string; url: string }

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
} satisfies Record<string, Ref>

export type RefId = keyof typeof REFS

/** A threshold, its source and the source's own words. */
export interface Rule { ref: RefId; page: string; quote: string }

export const RULES = {
  qrsAdult: { ref: 'partIII', page: 'e235', quote: 'a QRS duration of greater than 110 ms in subjects older than 16 years of age be regarded as abnormal' },
  qrsBbb: { ref: 'partIII', page: 'e236–e237', quote: 'QRS duration greater than or equal to 120 ms in adults (criterion 1 for both complete RBBB and complete LBBB)' },
  qtLong: { ref: 'partIV', page: 'e246', quote: 'the adjusted QT of 460 ms or longer in women and 450 ms or longer in men be considered a prolonged QT interval' },
  qtShort: { ref: 'partIV', page: 'e246', quote: 'QT 390 ms and shorter be considered a short QT interval' },
  qtFormula: { ref: 'partIV', page: 'e246', quote: 'linear regression functions rather than the Bazett’s formula be used for QT-rate correction' },
  stV23: { ref: 'partIV', page: 'e243', quote: 'abnormal J-point elevation in V2 and V3 … 0.2 mV for men 40 years of age and older and 0.25 mV for men less than 40 years of age … adult women in V2 and V3 is 0.15 mV' },
  stOther: { ref: 'partIV', page: 'e243', quote: 'The threshold recommended for abnormal J-point elevation for men and women in all other standard leads is 0.1 mV' },
  stDep: { ref: 'partIV', page: 'e243', quote: '−0.05 as the recommended threshold value for abnormal J-point depression in leads V2 and V3 in men and women and −0.1 mV in all other leads' },
  axis: { ref: 'partIII', page: 'e236', quote: 'In adults, the normal QRS axis is considered to be within −30° and 90°. Left-axis deviation is −30° and beyond … right-axis deviation in adults is from 90° to 120° … between 120° and 180°' },
} satisfies Record<string, Rule>

export type RuleId = keyof typeof RULES
