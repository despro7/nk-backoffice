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
}
