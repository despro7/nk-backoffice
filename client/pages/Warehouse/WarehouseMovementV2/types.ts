import type { ReleaseComponentBatch } from '@shared/types/warehouseRelease';

export interface MovementV2Line {
  id: string;
  sku: string;
  name: string;
  barcode: string;
  dilovodId: string | null;
  portionsPerBox: number;
  /** Залишок на складі-джерелі з пошуку (порції). */
  stockAtStorage?: number | null;
  batches: ReleaseComponentBatch[];
}

export interface MovementV2HistoryPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
