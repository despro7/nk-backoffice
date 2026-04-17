/**
 * ReceiptClientService — клієнтський сервіс для перегляду та друку чеків.
 *
 * Підтримує два типи чеків:
 * - fiscal: фіскальний (WordPress PDF або Dilovod JSON)
 * - warehouse: складський чек-ліст (розгорнуті OrderChecklistItem[])
 *
 * Для друку використовує printerService (QZ Tray).
 */

import type { OrderChecklistItem } from '../types/orderAssembly';
import {
  generateFiscalReceiptHTML,
  generateFiscalReceiptEscPos,
  generateWarehouseChecklistHTML,
  generateWarehouseChecklistEscPos,
  type FiscalReceiptData,
  type WarehouseChecklistOrderInfo,
} from '../lib/receiptTemplates';
import PrinterService from './printerService';
import { ToastService } from './ToastService';

// ────────────────────────────────────────────────────────────────
// Типи
// ────────────────────────────────────────────────────────────────

interface FetchReceiptOptions {
  orderId: number;
  orderNumber: string;
  orderSajt?: number | string;
  externalId: string;
  receiptIndex?: number;
}

interface PrintFiscalReceiptOptions extends FetchReceiptOptions {
  printerName: string;
}

interface PrintWarehouseChecklistOptions {
  items: OrderChecklistItem[];
  orderInfo: WarehouseChecklistOrderInfo;
  printerName: string;
}

// ────────────────────────────────────────────────────────────────
// Сервіс
// ────────────────────────────────────────────────────────────────

export class ReceiptClientService {
  /**
   * Виконує API-запит. Очікується, що apiCall передається ззовні
   * (з хука useApi або аналогу), тому сервіс зберігає його посилання.
   */
  private apiCall!: (url: string, options?: RequestInit) => Promise<Response>;

  public setApiCall(fn: (url: string, options?: RequestInit) => Promise<Response>): void {
    this.apiCall = fn;
  }

  // ──────────────────────────────────────────────────
  // ПЕРЕГЛЯД (без принтера)
  // ──────────────────────────────────────────────────

  /**
   * Відкриває фіскальний чек у новому вікні.
   * Логіка: спочатку Dilovod JSON, fallback — WP PDF (тільки для sajt==19).
   */
  async viewFiscalReceipt({
    orderId,
    orderNumber,
    orderSajt,
    externalId,
    receiptIndex = 0,
  }: FetchReceiptOptions): Promise<void> {
    try {
      const url = `/api/orders/${orderId}/fiscal-receipt${receiptIndex > 0 ? `?index=${receiptIndex}` : ''}`;
      const response = await this.apiCall(url);
      const data = await response.json();

      if (data.success && data.data?.receipt) {
        const html = generateFiscalReceiptHTML(
          data.data.receipt as FiscalReceiptData,
          orderNumber,
        );
        const w = window.open('', '_blank', 'width=800,height=600');
        if (w) {
          w.document.write(html);
          w.document.close();
        }
        return;
      }

      // Fallback — WP PDF
      if (orderSajt == 19 && externalId) {
        await this.openWordPressPDF(externalId);
      } else {
        ToastService.show({
          title: 'Фіскальний чек',
          description: data.message || 'Чек ще не сформовано',
          color: 'warning',
        });
      }
    } catch (error) {
      console.error('[ReceiptClientService] viewFiscalReceipt error:', error);
      if (orderSajt == 19 && externalId) {
        await this.openWordPressPDF(externalId);
      } else {
        ToastService.show({
          title: 'Помилка',
          description: 'Не вдалося отримати фіскальний чек',
          color: 'danger',
        });
      }
    }
  }

  /**
   * Відкриває складський чек-ліст у новому вікні.
   */
  viewWarehouseChecklist(
    items: OrderChecklistItem[],
    orderInfo: WarehouseChecklistOrderInfo,
  ): void {
    const html = generateWarehouseChecklistHTML(items, orderInfo);
    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  // ──────────────────────────────────────────────────
  // ДРУК через QZ Tray
  // ──────────────────────────────────────────────────

  /**
   * Друкує фіскальний чек на принтер чеків.
   * Пріоритет: WP PDF (base64 → printPdf) → Dilovod JSON (ESC/POS → printRaw).
   */
  async printFiscalReceipt({
    orderId,
    orderNumber,
    orderSajt,
    externalId,
    printerName,
    receiptIndex = 0,
  }: PrintFiscalReceiptOptions): Promise<void> {
    // 1. Спробуємо отримати WP PDF
    if (orderSajt == 19 && externalId) {
      try {
        const response = await this.apiCall(`/api/wordpress-receipt/fetch/${externalId}`);
        const data = await response.json();

        if (data.success && data.data) {
          await PrinterService.printPdf(printerName, data.data);
          return;
        }
      } catch (err) {
        console.warn('[ReceiptClientService] WP PDF fetch failed, falling back to Dilovod:', err);
      }
    }

    // 2. Fallback — Dilovod JSON → ESC/POS
    try {
      const url = `/api/orders/${orderId}/fiscal-receipt${receiptIndex > 0 ? `?index=${receiptIndex}` : ''}`;
      const response = await this.apiCall(url);
      const data = await response.json();

      if (data.success && data.data?.receipt) {
        const escPos = generateFiscalReceiptEscPos(
          data.data.receipt as FiscalReceiptData,
          orderNumber,
        );
        await PrinterService.printRaw(printerName, escPos);
        return;
      }

      ToastService.show({
        title: 'Фіскальний чек',
        description: data.message || 'Чек не знайдено. Друк неможливий.',
        color: 'warning',
      });
    } catch (error) {
      console.error('[ReceiptClientService] printFiscalReceipt error:', error);
      ToastService.show({
        title: 'Помилка друку чека',
        description: error instanceof Error ? error.message : 'Невідома помилка',
        color: 'danger',
      });
    }
  }

  /**
   * Друкує складський чек-ліст на принтер чеків (ESC/POS через QZ Tray).
   */
  async printWarehouseChecklist({
    items,
    orderInfo,
    printerName,
  }: PrintWarehouseChecklistOptions): Promise<void> {
    try {
      const escPos = generateWarehouseChecklistEscPos(items, orderInfo);
      await PrinterService.printRaw(printerName, escPos);
    } catch (error) {
      console.error('[ReceiptClientService] printWarehouseChecklist error:', error);
      ToastService.show({
        title: 'Помилка друку чек-листа',
        description: error instanceof Error ? error.message : 'Невідома помилка',
        color: 'danger',
      });
    }
  }

  // ──────────────────────────────────────────────────
  // Приватні допоміжні методи
  // ──────────────────────────────────────────────────

  private async openWordPressPDF(externalId: string): Promise<void> {
    try {
      const checkResponse = await this.apiCall(`/api/wordpress-receipt/check/${externalId}`);
      const checkData = await checkResponse.json();

      if (checkData.success && checkData.exists) {
        const pdfUrl = `https://nk-food.shop/wp-content/plugins/checkbox-pro/receipts-pdf/receipts/${externalId}.pdf#zoom=25`;
        window.open(pdfUrl, '_blank', 'width=800,height=600');
        ToastService.show({
          title: 'Чек з WordPress',
          description: 'Відкрито альтернативний чек',
          color: 'success',
        });
      } else {
        ToastService.show({
          title: 'Чек недоступний',
          description: 'Не вдалося знайти жодного чека для цього замовлення',
          color: 'warning',
        });
      }
    } catch (error) {
      console.error('[ReceiptClientService] openWordPressPDF error:', error);
      ToastService.show({
        title: 'Помилка',
        description: 'Не вдалося перевірити наявність альтернативного чека',
        color: 'danger',
      });
    }
  }
}

export const receiptClientService = new ReceiptClientService();
