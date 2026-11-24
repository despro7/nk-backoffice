export type DeviationHypothesisType =
  | 'kit_unposted'
  | 'kit_not_done'
  | 'order_unposted'
  | 'order_not_shipped'
  | 'movement_mismatch'
  | 'kit_swap'
  | 'return_unposted'
  | 'return_duplicated';

export type DeviationHypothesisConfidence = 'high' | 'medium' | 'low';

export interface DeviationHypothesisLine {
  sku: string;
  name: string;
  /** Очікуваний внесок гіпотези у відхилення цього SKU (зі знаком). */
  expected: number;
  /** Фактичне відхилення SKU в інвентаризації. */
  actual: number;
}

export interface DeviationHypothesisReference {
  kind: 'release_set' | 'order' | 'movement';
  id: string | number;
  number?: string | null;
  /** Номер замовлення SalesDrive (для відкриття в дровері); лише для `kind: 'order'`. */
  orderNumber?: string | null;
  date?: string | null;
}

/** Підміна товару: фізично використано/зібрано `actualSku` замість `expectedSku` (як у документі). */
export interface DeviationHypothesisSwap {
  kind: 'component' | 'set';
  expectedSku: string;
  expectedName: string;
  actualSku: string;
  actualName: string;
}

/** Кількість комплектації: проведено в обліку vs фізично (виведено з відхилення). */
export interface DeviationHypothesisKitQuantity {
  postedQty: number;
  impliedQty: number;
}

export interface DeviationHypothesis {
  id: string;
  type: DeviationHypothesisType;
  confidence: DeviationHypothesisConfidence;
  score: number;
  lines: DeviationHypothesisLine[];
  explainedUnits: number;
  reference?: DeviationHypothesisReference;
  /** Скільки однакових одно-SKU кандидатів схлопнуто в цю гіпотезу. */
  similarCount?: number;
  swap?: DeviationHypothesisSwap;
  kit?: DeviationHypothesisKitQuantity;
}

export interface DeviationResidualPattern {
  /** `chronic`: відхилення того ж знака в `hits` попередніх сесіях (історія нижче). */
  kind: 'chronic';
  hits: number;
  history: Array<{ sessionId: number; deviation: number }>;
}

export interface DeviationResidualLine {
  sku: string;
  name: string;
  deviation: number;
  pattern?: DeviationResidualPattern;
}

export interface DeviationHintsResponse {
  hypotheses: DeviationHypothesis[];
  totalDeviationUnits: number;
  explainedUnits: number;
  residual: DeviationResidualLine[];
  window: { from: string; to: string };
  /** Причин не знайдено, залишок: розсіяні ±1 без закономірностей (схоже на помилки підрахунку). */
  countingNoise?: boolean;
  /** Скільки попередніх сесій переглянуто для пошуку закономірностей. */
  historySessions?: number;
}
