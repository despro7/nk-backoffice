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
}
