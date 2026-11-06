/** Короткий опис циклу відвантаження (`order_shipments`) для UI. */
export interface OrderShipmentBriefDto {
  cycle: number;
  pickedAt: string;
  /** `dilovodId` документа sale, до якого привʼязано цикл. */
  saleDilovodId: string | null;
  /** `dilovodId` документа saleReturn, якщо цикл повернуто. */
  returnDilovodId: string | null;
  /** Кількість позицій замовлення в циклі. */
  itemsCount: number;
  /** Скільки з них відвантажено монолітними наборами. */
  monolithicCount: number;
  /** Кількість коробок (лише для циклів зі складом v2), інакше null. */
  boxesCount: number | null;
}

// ---------- Склад циклу v2 (`order_shipments.summary` / `.manifest`) ----------

/**
 * Режим позиції в обліку:
 * - `monolithic`: набір відвантажено цілим (рахунок монолітного набору, без розкладання);
 * - `forced_regular`: набір, який міг бути монолітом, комплектувальник вручну розклав;
 * - `regular`: звичайний товар або набір, розкладений за правилами.
 */
export type ShipmentItemMode = 'regular' | 'monolithic' | 'forced_regular';

export interface ShipmentSummaryItemV2 {
  sku: string;
  quantity: number;
  itemMode: ShipmentItemMode;
  productName?: string;
  price?: number;
  dilovodId?: string | null;
}

/** Обліковий шар: з нього будується `sale`, списання і повернення. */
export interface ShipmentSummaryV2 {
  version: 2;
  mode: 'regular' | 'monolithic' | 'mixed';
  /** Позиції замовлення (верхній рівень), як їх бачить документ відвантаження. */
  items: ShipmentSummaryItemV2[];
  /** Усі SKU, відвантажені монолітом, на будь-якій глибині набору → кількість. */
  monolithic: Record<string, number>;
  totals: { items: number; monolithicItems: number; boxes: number };
}

/**
 * Тип рядка в коробці:
 * - `monolithic_set`: монолітний набір (облік цілим);
 * - `set_unit`: набір, упакований цілим, але в обліку розкладений (монолітна категорія);
 * - `product`: звичайна позиція.
 */
export type ShipmentManifestLineType = 'product' | 'set_unit' | 'monolithic_set';

export interface ShipmentManifestLineV1 {
  sku: string | null;
  name: string;
  quantity: number;
  lineType: ShipmentManifestLineType;
  portionsPerItem?: number;
  /** Частина oversized-набору, розділеного між коробками. */
  split?: { index: number; total: number };
}

export interface ShipmentManifestBoxV1 {
  boxNum: number;
  boxName: string;
  /** Фізичний максимум порцій (`qntTo`), якщо відомий. */
  hardCap: number | null;
  usedPortions: number;
  lines: ShipmentManifestLineV1[];
}

/** Операційний шар: як замовлення зібрали (коробки, позиції поза коробками, рішення). */
export interface ShipmentManifestV1 {
  version: 1;
  boxes: ShipmentManifestBoxV1[];
  /** Позиції без коробки (коробки не обрано або розподіл не застосовувався). */
  looseLines: ShipmentManifestLineV1[];
  /** Що не влізло в коробки через ліміт. */
  unallocated: Array<{ name: string; quantity: number }>;
  decisions: Array<{ sku: string; decision: 'forced_regular'; reason: 'operator_override' }>;
}

/** Що клієнт надсилає в `PUT /api/orders/:id/status` полем `shipment`. */
export interface ShipmentRecordV2 {
  summary: ShipmentSummaryV2;
  manifest: ShipmentManifestV1;
}
