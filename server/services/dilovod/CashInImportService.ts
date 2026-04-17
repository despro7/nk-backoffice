/**
 * CashInImportService — парсинг Excel-файлу реєстру переказів
 * та валідація рядків проти БД замовлень.
 *
 * Відповідальність:
 * - Читання файлу через бібліотеку xlsx
 * - Витяг колонок B, C, D, G, I (рядки 13..N-1, останній "Всього" виключається)
 * - Пошук замовлень в БД по orderNumber або customerName
 * - Порівняння суми замовлення з amountReceived
 * - Повернення масиву CashInRow зі статусами валідації
 */

import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import type { CashInRow, CashInPreviewResponse, CashInOrderCandidate } from '../../../shared/types/cashIn.js';
import { logServer } from '../../lib/utils.js';

const prisma = new PrismaClient();

// Індекси колонок в Excel (0-based)
const COL = {
  TRANSFER_DATE: 1,   // C — Дата перерахунку
  AMOUNT_RECEIVED: 2, // D — Сума прийнятих коштів
  COMMISSION: 3,      // E — Сума утриманої винагороди
  BUYER_NAME: 6,      // H — ПІБ Покупця
  ORDER_NUMBER: 8,    // J — Номер замовлення
} as const;

// Рядок з якого починаються дані (0-based: рядок 13 в Excel = індекс 12)
const DATA_START_ROW = 10;

// Кількість днів для пошуку замовлень по ПІБ (при відсутньому номері)
const BUYER_SEARCH_DAYS = 30;

// Допустима розбіжність суми (0.01 грн — через округлення)
const AMOUNT_TOLERANCE = 0.01;

export class CashInImportService {
  /**
   * Парсить Excel-файл та валідує кожен рядок проти БД
   */
  async parseAndValidate(fileBuffer: Buffer): Promise<CashInPreviewResponse> {
    logServer('📂 [CashIn] Парсинг Excel-файлу...');

    // 1. Читаємо workbook з буферу
    // cellDates: true — щоб дати поверталися як Date-об'єкти (не serial numbers)
    // raw: true НЕ передаємо — він перевизначає cellDates і ламає парсинг дат
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // raw НЕ передаємо — з cellDates:true на рівні XLSX.read дати повертаються як Date,
    // а числові клітинки мають тип 'n' і так повертають number.
    // raw:true перевизначає cellDates і повертає serial numbers замість Date-об'єктів.
    const allRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      rawNumbers: true,
    });

    logServer(`📊 [CashIn] Всього рядків у файлі: ${allRows.length}`);

    // 2. Беремо рядки даних починаючи з DATA_START_ROW
    const dataRows = allRows.slice(DATA_START_ROW);
    logServer(`📊 [CashIn] Рядків для обробки (до фільтрації): ${dataRows.length}`);

    // 3. Валідуємо кожен рядок (послідовно — не паралельно, щоб не перевантажити БД)
    const rows: CashInRow[] = [];
    let seqIndex = 1; // Порядковий номер валідного рядка (не прив'язаний до Excel)
    for (let i = 0; i < dataRows.length; i++) {
      const excelRow = dataRows[i];

      // Пропускаємо рядки де немає числової суми > 0 (порожні рядки та рядок "Всього")
      // Дата може бути рядком "DD.MM.YYYY" або Date-об'єктом — перевіряємо обидва варіанти
      const rawAmount = excelRow?.[COL.AMOUNT_RECEIVED];
      const rawDate = excelRow?.[COL.TRANSFER_DATE];
      const hasValidDate =
        (rawDate instanceof Date && !isNaN(rawDate.getTime())) ||
        (typeof rawDate === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(rawDate.trim()));
      if (!excelRow || typeof rawAmount !== 'number' || rawAmount <= 0 || !hasValidDate) {
        continue;
      }

      const row = await this.validateRow(excelRow, seqIndex);
      rows.push(row);
      seqIndex++;
    }

    // 4. Підраховуємо статистику
    const okCount = rows.filter((r) => r.status === 'ok').length;
    const mismatchCount = rows.filter((r) => r.status === 'amount_mismatch').length;
    const ambiguousCount = rows.filter((r) => r.status === 'ambiguous').length;
    const notFoundCount = rows.filter((r) => r.status === 'not_found').length;
    const duplicateCount = rows.filter((r) => r.status === 'duplicate_cash_in').length;

    logServer(`✅ [CashIn] Результат парсингу: ok=${okCount}, mismatch=${mismatchCount}, ambiguous=${ambiguousCount}, notFound=${notFoundCount}, duplicate=${duplicateCount}`);

    return {
      rows,
      totalRows: rows.length,
      okCount,
      mismatchCount,
      ambiguousCount,
      notFoundCount,
      duplicateCount,
    };
  }

  /**
   * Валідує один рядок Excel: знаходить замовлення та порівнює суму
   */
  private async validateRow(excelRow: any[], rowIndex: number): Promise<CashInRow> {
    // Витягуємо значення з колонок
    const transferDate = this.parseDate(excelRow[COL.TRANSFER_DATE]);
    const amountReceived = this.parseNumber(excelRow[COL.AMOUNT_RECEIVED]);
    const commissionAmount = this.parseNumber(excelRow[COL.COMMISSION]);
    const buyerName = this.parseString(excelRow[COL.BUYER_NAME]);
    const orderNumber = this.parseString(excelRow[COL.ORDER_NUMBER]) || null;

    const baseRow: Omit<CashInRow, 'status'> = {
      rowIndex,
      transferDate,
      amountReceived,
      commissionAmount,
      buyerName,
      orderNumber,
    };

    try {
      // --- Пошук по номеру замовлення ---
      if (orderNumber) {
        const order = await prisma.order.findFirst({
          where: { orderNumber },
          select: { orderNumber: true, orderDate: true, totalPrice: true, dilovodDocId: true, dilovodCashInDate: true },
        });

        if (!order) {
          return {
            ...baseRow,
            status: 'not_found',
            errorMessage: `Замовлення №${orderNumber} не знайдено в БД`,
          };
        }

        return this.buildValidatedRow(baseRow, order);
      }

      // --- Пошук по ПІБ покупця (останні 30 днів) ---
      if (buyerName) {
        const since = new Date();
        since.setDate(since.getDate() - BUYER_SEARCH_DAYS);

        const orders = await prisma.order.findMany({
          where: {
            customerName: { contains: buyerName },
            orderDate: { gte: since },
          },
          select: { orderNumber: true, orderDate: true, totalPrice: true, dilovodDocId: true, dilovodCashInDate: true },
          orderBy: { orderDate: 'desc' },
        });

        if (orders.length === 0) {
          return {
            ...baseRow,
            status: 'not_found',
            errorMessage: `Замовлення для покупця "${buyerName}" не знайдено за останні ${BUYER_SEARCH_DAYS} днів`,
          };
        }

        if (orders.length === 1) {
          return this.buildValidatedRow(baseRow, orders[0]);
        }

        // Більше одного — повертаємо список кандидатів
        const candidates: CashInOrderCandidate[] = orders.map((o) => ({
          orderNumber: o.orderNumber,
          orderDate: o.orderDate?.toISOString() ?? '',
          totalPrice: o.totalPrice ?? 0,
        }));

        return {
          ...baseRow,
          status: 'ambiguous',
          candidates,
          errorMessage: `Знайдено ${orders.length} замовлень для "${buyerName}"`,
        };
      }

      // --- Немає ні номера, ні ПІБ ---
      return {
        ...baseRow,
        status: 'not_found',
        errorMessage: 'Відсутній номер замовлення та ПІБ покупця',
      };
    } catch (error: any) {
      logServer(`❌ [CashIn] Помилка валідації рядка ${rowIndex}: ${error.message}`);
      return {
        ...baseRow,
        status: 'not_found',
        errorMessage: `Помилка БД: ${error.message}`,
      };
    }
  }

  /**
   * Порівнює суму замовлення з отриманою сумою і повертає відповідний статус
   */
  private buildValidatedRow(
    base: Omit<CashInRow, 'status'>,
    order: { orderNumber: string; orderDate: Date | null; totalPrice: number | null; dilovodDocId: string | null; dilovodCashInDate: Date | null }
  ): CashInRow {
    const dbAmount = order.totalPrice ?? 0;
    const diff = Math.abs(dbAmount - base.amountReceived);

    if (diff > AMOUNT_TOLERANCE) {
      return {
        ...base,
        status: 'amount_mismatch',
        resolvedOrderNumber: order.orderNumber,
        dilovodDocId: order.dilovodDocId,
        dbOrderAmount: dbAmount,
        errorMessage: `Сума в БД: ${dbAmount.toFixed(2)} грн, в файлі: ${base.amountReceived.toFixed(2)} грн`,
      };
    }

    // Сума збігається — перевіряємо, чи вже є документ надходження грошей
    if (order.dilovodCashInDate) {
      const cashInDate = new Date(order.dilovodCashInDate).toLocaleDateString('uk-UA', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      return {
        ...base,
        status: 'duplicate_cash_in',
        resolvedOrderNumber: order.orderNumber,
        dilovodDocId: order.dilovodDocId,
        dbOrderAmount: dbAmount,
        errorMessage: `Документ надходження вже створено ${cashInDate}. Відправка може створити дублікат.`,
        allowDuplicate: false,
      };
    }

    return {
      ...base,
      status: 'ok',
      resolvedOrderNumber: order.orderNumber,
      dilovodDocId: order.dilovodDocId,
      dbOrderAmount: dbAmount,
    };
  }

  // --- Допоміжні методи парсингу значень клітинок ---

  private parseDate(value: any): string {
    if (!value) return new Date().toISOString();
    // З cellDates:true дата може повернутися як Date-об'єкт
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
    }
    // Рядок у форматі DD.MM.YYYY (типовий формат у цьому файлі)
    if (typeof value === 'string') {
      const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (match) {
        const [, day, month, year] = match;
        return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
      }
    }
    // Fallback
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  private parseNumber(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    // З raw:true числа приходять як number — просто кастуємо
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    // Fallback для рядків (xlsx іноді повертає рядки для текстових клітинок)
    const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  private parseString(value: any): string {
    return value !== null && value !== undefined ? String(value).trim() : '';
  }
}

export const cashInImportService = new CashInImportService();
