import type { ReturnHistoryRecord } from '@/pages/Warehouse/WarehouseReturns/WarehouseReturnsTypes';
import { fetchWarehouseDocHistoryPage } from '@/pages/Warehouse/shared/fetchWarehouseDocHistoryPage';
import type { WarehouseDocHistoryFilters } from '@shared/utils/warehouseDocHistoryListQuery';
import type { WarehouseDocHistoryPagination } from '@/pages/Warehouse/shared/warehouseDocHistoryTypes';

// ---------------------------------------------------------------------------
// ReturnsHistoryService — сервіс для роботи з історією повернень
// ---------------------------------------------------------------------------

export class ReturnsHistoryService {
  /**
   * Отримати історію повернень (пагінація + фільтри)
   */
  static async getHistoryPage(
    page: number,
    limit: number,
    filters: WarehouseDocHistoryFilters,
  ): Promise<{ records: ReturnHistoryRecord[]; pagination: WarehouseDocHistoryPagination }> {
    try {
      const result = await fetchWarehouseDocHistoryPage(
        '/api/warehouse/returns/history',
        'active',
        page,
        limit,
        filters,
      );
      return {
        records: result.records as ReturnHistoryRecord[],
        pagination: result.pagination,
      };
    } catch (error) {
      console.error('[ReturnsHistoryService] getHistoryPage error:', error);
      throw error;
    }
  }

  /**
   * @deprecated використовуйте getHistoryPage
   */
  static async getHistory(): Promise<ReturnHistoryRecord[]> {
    const { records } = await this.getHistoryPage(1, 100, {
      search: '',
      dateFrom: null,
      dateTo: null,
      dateField: 'operDate',
      sortBy: 'operDate',
      sortOrder: 'desc',
    });
    return records;
  }

  /**
   * Зберегти запис про повернення
   */
  static async saveRecord(record: Omit<ReturnHistoryRecord, 'id' | 'createdAt' | 'createdBy'>): Promise<ReturnHistoryRecord> {
    try {
      const response = await fetch('/api/warehouse/returns/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(record),
      });

      if (!response.ok) {
        throw new Error('Не вдалось зберегти історію повернення');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[ReturnsHistoryService] saveRecord error:', error);
      throw error;
    }
  }

  /**
   * Видалити запис про повернення (тільки для адміністратора)
   */
  static async deleteRecord(id: string, options?: { forceLocal?: boolean }): Promise<any> {
    try {
      const url = options?.forceLocal ? `/api/warehouse/returns/history/${id}?forceLocal=true` : `/api/warehouse/returns/history/${id}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data?.message || data?.error || 'Не вдалось видалити історію повернення';
        const err = new Error(message);
        (err as any).response = data;
        throw err;
      }

      return data;
    } catch (error) {
      console.error('[ReturnsHistoryService] deleteRecord error:', error);
      throw error;
    }
  }

  /**
   * Завантажити окремий запис (для відновлення)
   */
  static async loadRecord(id: string): Promise<ReturnHistoryRecord | null> {
    try {
      const { records } = await this.getHistoryPage(1, 100, {
        search: '',
        dateFrom: null,
        dateTo: null,
        dateField: 'operDate',
        sortBy: 'operDate',
        sortOrder: 'desc',
      });
      return records.find((r) => String(r.id) === String(id)) || null;
    } catch (error) {
      console.error('[ReturnsHistoryService] loadRecord error:', error);
      return null;
    }
  }
}
