import type { ReturnHistoryRecord } from '@/pages/Warehouse/WarehouseReturns/WarehouseReturnsTypes';

// ---------------------------------------------------------------------------
// ReturnsHistoryService — сервіс для роботи з історією повернень
// ---------------------------------------------------------------------------

export class ReturnsHistoryService {
  /**
   * Отримати історію повернень
   */
  static async getHistory(): Promise<ReturnHistoryRecord[]> {
    try {
      const response = await fetch('/api/warehouse/returns/history', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Не вдалось завантажити історію повернень');
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('[ReturnsHistoryService] getHistory error:', error);
      throw error;
    }
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
      const history = await this.getHistory();
      return history.find((r) => r.id === id) || null;
    } catch (error) {
      console.error('[ReturnsHistoryService] loadRecord error:', error);
      return null;
    }
  }
}
