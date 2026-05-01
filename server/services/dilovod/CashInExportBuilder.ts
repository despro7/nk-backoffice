/**
 * CashInExportBuilder — побудова Payload для документа "Надходження грошей"
 * (documents.cashIn) та відправка в Dilovod API.
 *
 * Відповідальність:
 * - Побудова payload по кожному підтвердженому рядку
 * - Отримання cashAccount з channelPaymentMapping по фіксованому paymentFormId "Післяплата"
 * - Відправка через dilovodService.exportToDilovod
 * - Повернення результатів (success/errors) для кожного рядка
 */

import { PrismaClient } from '@prisma/client';
import { dilovodService } from './DilovodService.js';
import { isDilovodExportError, getDilovodExportErrorMessage, getDilovodUserId } from './DilovodUtils.js';
import { logServer } from '../../lib/utils.js';
import type { CashInConfirmedRow, CashInExportResponse } from '../../../shared/types/cashIn.js';

const prisma = new PrismaClient();

// Хардкодовані константи Dilovod для документа cashIn
const CASH_IN_CONSTANTS = {
  DOC_TYPE: 'documents.cashIn',
  CURRENCY: '1101200000001001',         // UAH
  CASH_ITEM: '1104300000001022',
  BUSINESS: '1115000000000001',
  COR_ACCOUNT: '1119000000001111',
  SETTLEMENTS_KIND: '1103300000000001',
  AUTHOR: '1000200000001014',           // Менеджер зі збуту
  PAYMENT_FORM_POSTPAY: '1110300000001002', // Форма оплати "Післяплата"
  STATE_DONE: '1111500000001010',        // Статус "Виконано" для замовлення
} as const;

export interface CashInPayloadItem {
  rowIndex: number;
  orderNumber: string;
  payload: Record<string, any>;
}

export interface CashInBuildResult {
  payloads: CashInPayloadItem[];
  cashAccount: string;
  firm: string;
}

export class CashInExportBuilder {
  /**
   * Будує масив payload-ів для всіх підтверджених рядків (без відправки).
   * Використовується для dry-run (кнопка "Payload" в debug-режимі).
   */
  async buildPayloads(rows: CashInConfirmedRow[], userId?: number): Promise<CashInBuildResult> {
    const { firm, cashAccount } = await this.loadSettings();
    const authorId = await this.resolveAuthorId(userId);

    // Послідовно (Dilovod блокує паралельні запити через multithreadApiSession)
    const payloads: CashInPayloadItem[] = [];
    for (const row of rows) {
      payloads.push(await this.buildSinglePayload(row, firm, cashAccount, authorId));
    }

    return { payloads, cashAccount, firm };
  }

  /**
   * Будує payload-и та відправляє їх в Dilovod.
   * Повертає зведений результат з лічильниками успіхів та помилок.
   */
  async exportAll(rows: CashInConfirmedRow[], userId?: number): Promise<CashInExportResponse> {
    logServer(`🚀 [CashIn] Починаємо відправку ${rows.length} документів в Діловод...`);

    const { payloads } = await this.buildPayloads(rows, userId);

    let exportedCount = 0;
    const errors: CashInExportResponse['errors'] = [];

    // Послідовна відправка (Dilovod блокує паралельні запити)
    for (const item of payloads) {
      try {
        logServer(`  📤 [CashIn] Відправляємо рядок ${item.rowIndex}, замовлення №${item.orderNumber}...`);
        const result = await dilovodService.exportToDilovod(item.payload);

        if (isDilovodExportError(result)) {
          const errMsg = getDilovodExportErrorMessage(result);
          logServer(`  ❌ [CashIn] Рядок ${item.rowIndex}: ${errMsg}`);
          errors.push({ rowIndex: item.rowIndex, orderNumber: item.orderNumber, error: errMsg });
        } else {
          logServer(`  ✅ [CashIn] Рядок ${item.rowIndex}: документ створено (id: ${result?.id})`);
          exportedCount++;

          // Оновлюємо дату cashIn в БД
          await this.markOrderAsCashIn(item.orderNumber).catch((e) =>
            logServer(`  ⚠️ [CashIn] Не вдалося оновити dilovodCashInDate для №${item.orderNumber}: ${e.message}`)
          );

          // Змінюємо статус замовлення на "Виконано" в Dilovod
          const docIdToUpdate = (item.payload as any)?.header?.baseDoc;
          if (docIdToUpdate) {
            await this.updateOrderDocumentState(docIdToUpdate, item.orderNumber).catch((e) =>
              logServer(`  ⚠️ [CashIn] Не вдалося оновити статус замовлення №${item.orderNumber} в Dilovod: ${e.message}`)
            );
          }
        }
      } catch (error: any) {
        logServer(`  ❌ [CashIn] Рядок ${item.rowIndex} — виключення: ${error.message}`);
        errors.push({ rowIndex: item.rowIndex, orderNumber: item.orderNumber, error: error.message });
      }
    }

    logServer(`📊 [CashIn] Завершено: відправлено ${exportedCount}, помилок ${errors.length}`);

    return {
      success: errors.length === 0,
      exportedCount,
      errors,
    };
  }

  /**
   * Будує один payload для документа cashIn
   */
  private async buildSinglePayload(
    row: CashInConfirmedRow,
    firm: string,
    cashAccount: string,
    authorId: string,
  ): Promise<CashInPayloadItem> {
    const formattedDate = this.formatDateForDilovod(row.transferDate);

    // Шукаємо контрагента в Dilovod по номеру телефону з замовлення
    const person = await this.resolvePersonId(row.orderNumber);

    const payload = {
			saveType: 1, // 1 — провести документ одразу після створення
      header: {
        id: CASH_IN_CONSTANTS.DOC_TYPE,
        date: formattedDate,
        baseDoc: row.dilovodDocId ?? '',
        firm,
        cashAccount,
        person,
        currency: CASH_IN_CONSTANTS.CURRENCY,
        content: `Післяплата замовлення ${row.orderNumber}`,
        cashItem: CASH_IN_CONSTANTS.CASH_ITEM,
        amountCur: row.amountReceived,
        amountCurCommission: row.commissionAmount,
        business: CASH_IN_CONSTANTS.BUSINESS,
        corAccount: CASH_IN_CONSTANTS.COR_ACCOUNT,
        settlementsKind: CASH_IN_CONSTANTS.SETTLEMENTS_KIND,
        taxAccount: 1,
        author: authorId,
        remark: `Автоматично додано через Backoffice - ${new Date().toLocaleString('uk-UA')}`,
      },
      // Таблична частина — Dilovod бере суму саме з tpAnalytics (не з header.amountCur)
      tableParts: {
        tpAnalytics: [
          {
            rowNum: 1,
            analytics1: row.dilovodDocId ?? 0,  // ID базового документа (замовлення)
            amountCur: row.amountReceived,
            amountCurCommission: row.commissionAmount,
          },
        ],
      },
    };

    return { rowIndex: row.rowIndex, orderNumber: row.orderNumber, payload };
  }

  /**
   * Резолвить dilovodUserId автора за локальним userId з БД.
   * Використовує спільну функцію getDilovodUserId з DilovodUtils.
   * Якщо userId не переданий або запис не знайдений — повертає хардкодований AUTHOR.
   */
  private async resolveAuthorId(userId: number | undefined): Promise<string> {
    return getDilovodUserId(userId, {
      fallback: CASH_IN_CONSTANTS.AUTHOR, // Менеджер зі збуту як дефолтний автор для cashIn
      logPrefix: '[CashIn] '
    });
  }

  /**
   * Знаходить ID контрагента в Dilovod за номером телефону з замовлення в БД.
   * Повертає порожній рядок якщо не знайдено.
   */
  private async resolvePersonId(orderNumber: string): Promise<string> {
    try {
      const order = await prisma.order.findFirst({
        where: { orderNumber },
        select: { customerPhone: true, customerName: true },
      });
      if (!order?.customerPhone) return '';

      const person = await dilovodService.findPersonByPhone(order.customerPhone);
      if (person?.id) {
        logServer(`✅ [CashIn] Контрагент для замовлення №${orderNumber}: ${person.name} (${person.id})`);
        return person.id;
      }
      logServer(`⚠️ [CashIn] Контрагент не знайдений в Діловод для тел. ${order.customerPhone} (замовлення №${orderNumber})`);
    } catch (e: any) {
      logServer(`⚠️ [CashIn] Помилка пошуку контрагента для замовлення №${orderNumber}: ${e.message}`);
    }
    return '';
  }

  /**
   * Завантажує firm та cashAccount з налаштувань
   */
  private async loadSettings(): Promise<{ firm: string; cashAccount: string }> {
    const settings = await prisma.settingsBase.findMany({
      where: { category: 'dilovod', isActive: true },
      select: { key: true, value: true },
    });

    const map = new Map(settings.map((s) => [s.key, s.value]));

    const firm = map.get('dilovod_default_firm_id') ?? '';

    // Знаходимо cashAccount з channelPaymentMapping по формі оплати "Післяплата"
    const cashAccount = this.resolveCashAccount(
      map.get('dilovod_channel_payment_mapping'),
      CASH_IN_CONSTANTS.PAYMENT_FORM_POSTPAY
    );

    if (!firm) {
      throw new Error('dilovod_default_firm_id не налаштовано в settings_base');
    }
    if (!cashAccount) {
      logServer(`⚠️ [CashIn] cashAccount не знайдено для форми оплати "Післяплата" (${CASH_IN_CONSTANTS.PAYMENT_FORM_POSTPAY}). Перевірте налаштування Діловод → Мапінг каналів.`);
    } else {
      logServer(`✅ [CashIn] cashAccount знайдено: ${cashAccount}`);
    }

    return { firm, cashAccount };
  }

  /**
   * Знаходить cashAccount в channelPaymentMapping по paymentFormId.
   * Структура: { [channelId]: { mappings: [{ paymentForm, cashAccount, ... }] } }
   */
  private resolveCashAccount(mappingJson: string | undefined, paymentFormId: string): string {
    if (!mappingJson) return '';
    try {
      const channelMap: Record<string, any> = JSON.parse(mappingJson);
      // Перебираємо всі канали та їхні масиви mappings
      for (const channelSettings of Object.values(channelMap)) {
        const mappings: any[] = channelSettings?.mappings ?? [];
        const match = mappings.find((m: any) => m?.paymentForm === paymentFormId);
        if (match?.cashAccount) {
          return match.cashAccount;
        }
      }
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Позначає замовлення як оброблене cashIn в БД
   */
  private async markOrderAsCashIn(orderNumber: string): Promise<void> {
    await prisma.order.updateMany({
      where: { orderNumber },
      data: { dilovodCashInDate: new Date() },
    });
  }

  /**
   * Встановлює статус "Виконано" для документа замовлення в Dilovod API.
   * Викликається після успішного створення cashIn-документа.
   */
  private async updateOrderDocumentState(dilovodDocId: string, orderNumber: string): Promise<void> {
    const payload = {
      header: {
        id: dilovodDocId,
        state: CASH_IN_CONSTANTS.STATE_DONE,
      },
    };
    const result = await dilovodService.exportToDilovod(payload);
    if (isDilovodExportError(result)) {
      throw new Error(getDilovodExportErrorMessage(result));
    }
    logServer(`  ✅ [CashIn] Статус замовлення №${orderNumber} (${dilovodDocId}) → "Виконано"`);
  }

  /**
   * Форматує ISO-дату у форматі "YYYY-MM-DD 00:00:00" для Dilovod API
   */
  private formatDateForDilovod(isoDate: string): string {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} 23:00:00`;
  }
}

export const cashInExportBuilder = new CashInExportBuilder();
