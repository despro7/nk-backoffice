export type {
  ProductMovementsGroup,
  ProductMovementsLine,
  ProductMovementsMetaResponse,
  ProductMovementsQueryRequest,
  ProductMovementsQueryResponse,
  ProductMovementsResolvedShape,
} from '@shared/types/productMovements';

export interface ProductMovementsFilterState {
  sku: string | null;
  productName: string | null;
  dilovodGoodId: string | null;
  startDate: string;
  endDate: string;
  goodPartId: string | null;
  batchLabel: string | null;
  storageId: string | null;
  firmId: string | null;
}

export type ProductMovementsDrawerPlacement = 'left' | 'right';

export interface ProductMovementsOpenParams {
  sku?: string;
  dilovodGoodId?: string;
  productName?: string;
  goodPartId?: string;
  batchLabel?: string;
  storageId?: string;
  firmId?: string;
  period?: { startDate: string; endDate: string };
  /** Автоматично сформувати звіт після відкриття drawer. */
  autoGenerate?: boolean;
  /** Сторона екрану. За замовчуванням `right`  */
  placement?: ProductMovementsDrawerPlacement;
  /** Не закривати кліком зовні / Escape; прозорий backdrop; кліки проходять на контент поза drawer (можна працювати з фоном паралельно). За замовчуванням `false`. */
  nonDismissable?: boolean;
}
