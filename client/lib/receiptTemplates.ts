/**
 * Шаблони чеків для перегляду та ESC/POS друку.
 * Підтримує фіскальні чеки (Dilovod JSON) та складські чек-листи.
 */

import type { OrderChecklistItem } from '../types/orderAssembly';

// ────────────────────────────────────────────────────────────────
// Типи
// ────────────────────────────────────────────────────────────────

export interface FiscalReceiptData {
  header: {
    ORGNM?: string;
    POINTNM?: string;
    POINTADDR?: string;
    TIN?: string;
    CASHREGISTERNUM?: string;
    ORDERTAXNUM?: string;
    ORDERDATE?: string;
    ORDERTIME?: string;
    taxAccount?: string;
  };
  goods?: Array<{
    NAME?: string;
    AMOUNT?: number;
    PRICE?: number;
    COST?: number;
    LETTERS?: string;
  }>;
  totals?: {
    SUM?: number;
  };
  payments?: {
    SUM?: number;
    PAYFORMNM?: string;
    PAYSYS?: {
      cardMask?: string;
      NAME?: string;
      rrn?: string;
    };
  };
  taxes?: {
    NAME?: string;
    LETTER?: string;
  };
}

export interface WarehouseChecklistOrderInfo {
  orderNumber: string;
  ttn?: string;
  customerName?: string;
}

// ────────────────────────────────────────────────────────────────
// Допоміжні форматери (використовуються в обох типах)
// ────────────────────────────────────────────────────────────────

function formatPrice(value: number | undefined): string {
  if (value === undefined || value === null) return '0.00';
  return Number(value).toFixed(2);
}

function formatReceiptDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) return dateStr;
  if (/^\d{8}$/.test(dateStr)) {
    const day = dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4);
    const year = dateStr.substring(4, 8);
    return `${day}.${month}.${year}`;
  }
  try {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateStr;
  }
}

function formatDateForTax(dateStr: string | undefined): string {
  if (!dateStr) return '';
  if (/^\d{8}$/.test(dateStr)) {
    const day = dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4);
    const year = dateStr.substring(4, 8);
    return `${year}${month}${day}`;
  }
  return dateStr;
}

function formatTime(timeStr: string | undefined): string {
  if (!timeStr) return '';
  if (/^\d{2}-\d{2}-\d{2}$/.test(timeStr)) return timeStr;
  if (/^\d{6}$/.test(timeStr)) {
    const hours = timeStr.substring(0, 2);
    const minutes = timeStr.substring(2, 4);
    const seconds = timeStr.substring(4, 6);
    return `${hours}-${minutes}-${seconds}`;
  }
  return timeStr;
}

/** Поточна дата у форматі dd.mm.yyyy */
function currentDate(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

/** Поточний час у форматі hh:mm */
function currentTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ────────────────────────────────────────────────────────────────
// ESC/POS константи
// ────────────────────────────────────────────────────────────────

const ESC = '\x1B';
const GS = '\x1D';

const RESET = `${ESC}@`;
const CUT = `${GS}V\x41\x00`;

const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const ALIGN_CENTER = `${ESC}a\x01`;
const ALIGN_LEFT = `${ESC}a\x00`;
const LINE_FEED = '\n';

/** Максимальна ширина рядка для 58мм принтера */
const LINE_WIDTH = 32;

/** Заповнює рядок до потрібної ширини пробілами праворуч */
function padRight(str: string, width: number): string {
  return str.length >= width ? str.substring(0, width) : str + ' '.repeat(width - str.length);
}

/** Заповнює рядок до потрібної ширини пробілами ліворуч */
function padLeft(str: string, width: number): string {
  return str.length >= width ? str.substring(0, width) : ' '.repeat(width - str.length) + str;
}

/** Рядок з розрівнюванням: текст ліворуч + текст праворуч */
function rowSpaceBetween(left: string, right: string, width: number = LINE_WIDTH): string {
  const space = width - left.length - right.length;
  if (space <= 0) return left.substring(0, width - right.length) + right;
  return left + ' '.repeat(space) + right;
}

/** Горизонтальний роздільник */
function divider(char = '-', width = LINE_WIDTH): string {
  return char.repeat(width) + LINE_FEED;
}

/** Перенесення довгого рядка на кілька рядків по ширині */
function wrapText(text: string, width: number = LINE_WIDTH): string {
  if (text.length <= width) return text + LINE_FEED;
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    lines.push(text.substring(i, i + width));
  }
  return lines.join(LINE_FEED) + LINE_FEED;
}

// ────────────────────────────────────────────────────────────────
// 3a. HTML фіскального чека (Dilovod JSON) — перенесено з OrderViewHeader
// ────────────────────────────────────────────────────────────────

export function generateFiscalReceiptHTML(receiptData: FiscalReceiptData, orderNumber: string): string {
  const { header, goods, totals, payments, taxes } = receiptData;

  const qrUrl =
    header.CASHREGISTERNUM && header.ORDERTAXNUM && header.ORDERDATE && header.ORDERTIME
      ? `https://cabinet.tax.gov.ua/cashregs/check?fn=${header.CASHREGISTERNUM}&id=${header.ORDERTAXNUM}&date=${formatDateForTax(header.ORDERDATE)}&time=${header.ORDERTIME}&sm=${totals?.SUM || payments?.SUM || 0}`
      : '';

  const goodsHTML =
    goods && goods.length > 0
      ? goods
          .map((item) => {
            const amount = item.AMOUNT || 0;
            const price = item.PRICE || 0;
            const cost = item.COST || amount * price;

            return `
            <div style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between;">
                <span>${amount.toFixed(3)} x ${formatPrice(price)}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="flex: 1; padding-right: 8px;">${item.NAME || 'Товар'}</span>
                <span style="white-space: nowrap;">${formatPrice(cost)} ${item.LETTERS || ''}</span>
              </div>
            </div>
          `;
          })
          .join('')
      : '<div style="text-align: center; color: #6b7280;">Немає товарів</div>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Фіскальний чек №${orderNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: monospace, "Courier New", Courier;
          font-size: 12px;
          line-height: 1.1;
          padding: 20px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          min-height: 100vh;
        }
        .receipt {
          width: 240px;
          background: white;
          border: 2px solid #000;
          padding: 16px;
        }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .border-b { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
        .border-dashed { border-bottom: 1px dashed #9ca3af; margin: 8px 0; }
        .flex { display: flex; }
        .justify-between { justify-content: space-between; }
        .mt-1 { margin-top: 4px; }
        .mb-1 { margin-bottom: 4px; }
        .mb-2 { margin-bottom: 8px; }
        .pb-2 { padding-bottom: 8px; }
        .pt-2 { padding-top: 8px; }
        .text-sm { font-size: 10px; }
        .text-lg { font-size: 14px; }
        .qr-container { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-bottom: 8px; }
        @media print {
          body { padding: 0; }
          .receipt { border: none; }
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <div class="text-center border-b">
          <div class="font-bold">ФОП ${header.ORGNM || ''}</div>
          ${header.POINTNM ? `<div>${header.POINTNM}</div>` : ''}
          ${header.POINTADDR ? `<div class="mt-1">${header.POINTADDR}</div>` : ''}
          ${header.TIN ? `<div class="mt-1">ІД ${header.TIN}</div>` : ''}
        </div>

        <div class="mb-2">${goodsHTML}</div>

        <div class="border-dashed"></div>

        ${
          payments
            ? `
          <div class="text-sm mb-2">
            <div>Продаж</div>
            ${payments.PAYSYS?.cardMask ? `<div class="flex justify-between"><span>ЕПЗ</span> ${payments.PAYSYS.cardMask}</div>` : ''}
            ${payments.PAYSYS?.NAME ? `<div class="flex justify-between"><span>ПЛАТІЖНА СИСТЕМА</span> ${payments.PAYSYS.NAME}</div>` : ''}
            ${payments.PAYSYS?.rrn ? `<div class="flex justify-between"><span>RRN</span> ${payments.PAYSYS.rrn}</div>` : ''}
            ${
              payments.PAYFORMNM === 'Післяплата'
                ? `<div class="flex justify-between"><span>Післяплата</span> ${formatPrice(payments.SUM)} ГРН</div>`
                : `<div class="flex justify-between"><span>Безготівкова</span> <span>${formatPrice(payments.SUM)} ГРН<br/>${payments.PAYFORMNM || ''}</span></div>`
            }
          </div>
        `
            : ''
        }

        <div class="border-b">
          <div class="flex justify-between font-bold text-lg">
            <span>СУМА</span>
            <span>${formatPrice(totals?.SUM || payments?.SUM || 0)} ГРН</span>
          </div>
          ${taxes ? `<div>${taxes.NAME || ''} ${taxes.LETTER || ''}</div>` : ''}
        </div>

        ${
          orderNumber
            ? `
          <div class="text-center border-b">
            <div>Замовлення №${orderNumber}</div>
          </div>
        `
            : ''
        }

        <div class="text-center mb-2">
          ${header.ORDERTAXNUM ? `<div class="mb-1">Чек № ${header.ORDERTAXNUM}</div>` : ''}
          <div class="flex justify-between">
            <span>${formatReceiptDate(header.ORDERDATE)}</span>
            <span>${formatTime(header.ORDERTIME)}</span>
          </div>
        </div>

        ${
          qrUrl
            ? `
          <div class="qr-container">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(qrUrl)}" alt="QR код" />
            <div class="text-center font-bold">ОНЛАЙН</div>
          </div>
        `
            : ''
        }

        <div class="text-center text-sm border-b pt-2">
          ${header.CASHREGISTERNUM ? `<div class="flex justify-between"><span>ФН ПРРО</span> <span>${header.CASHREGISTERNUM}</span></div>` : ''}
          ${header.taxAccount ? `<div>ФІСКАЛЬНИЙ ЧЕК</div>` : ''}
        </div>
      </div>
      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `;
}

// ────────────────────────────────────────────────────────────────
// 3b. ESC/POS фіскального чека (Dilovod JSON)
// ────────────────────────────────────────────────────────────────

export function generateFiscalReceiptEscPos(
  receiptData: FiscalReceiptData,
  orderNumber: string,
): string {
  const { header, goods, totals, payments, taxes } = receiptData;
  let out = '';

  // RESET + вибір кодової сторінки CP866 (17 = 0x11) для кирилиці
  out += RESET;
  out += `${ESC}t\x11`;
  out += ALIGN_CENTER;

  // Шапка
  if (header.ORGNM) {
    out += BOLD_ON + wrapText(`ФОП ${header.ORGNM}`) + BOLD_OFF;
  }
  if (header.POINTNM) out += wrapText(header.POINTNM);
  if (header.POINTADDR) out += wrapText(header.POINTADDR);
  if (header.TIN) out += `ІД ${header.TIN}` + LINE_FEED;

  out += ALIGN_LEFT;
  out += divider();

  // Товари
  if (goods && goods.length > 0) {
    goods.forEach((item) => {
      const amount = item.AMOUNT || 0;
      const price = item.PRICE || 0;
      const cost = item.COST || amount * price;

      out += wrapText(item.NAME || 'Товар');
      out += rowSpaceBetween(
        `  ${amount.toFixed(3)} x ${formatPrice(price)}`,
        `${formatPrice(cost)} ${item.LETTERS || ''}`,
      ) + LINE_FEED;
    });
  }

  out += divider();

  // Підсумок
  const totalSum = totals?.SUM || payments?.SUM || 0;
  out += BOLD_ON + rowSpaceBetween('СУМА:', `${formatPrice(totalSum)} ГРН`) + LINE_FEED + BOLD_OFF;

  if (taxes) {
    out += `${taxes.NAME || ''} ${taxes.LETTER || ''}` + LINE_FEED;
  }

  // Спосіб оплати
  if (payments) {
    const payForm =
      payments.PAYFORMNM === 'Післяплата'
        ? `Післяплата ${formatPrice(payments.SUM)} ГРН`
        : `Безготівкова ${formatPrice(payments.SUM)} ГРН`;
    out += payForm + LINE_FEED;
    if (payments.PAYSYS?.cardMask) out += `ЕПЗ: ${payments.PAYSYS.cardMask}` + LINE_FEED;
  }

  out += divider();

  // Реквізити
  if (orderNumber) out += `Замовлення №${orderNumber}` + LINE_FEED;
  if (header.ORDERTAXNUM) out += `Чек № ${header.ORDERTAXNUM}` + LINE_FEED;
  out += rowSpaceBetween(formatReceiptDate(header.ORDERDATE) || '', formatTime(header.ORDERTIME) || '') + LINE_FEED;

  if (header.CASHREGISTERNUM) {
    out += `ФН ПРРО: ${header.CASHREGISTERNUM}` + LINE_FEED;
  }

  // QR-код (тільки якщо підтримується принтером)
  const qrUrl =
    header.CASHREGISTERNUM && header.ORDERTAXNUM && header.ORDERDATE && header.ORDERTIME
      ? `https://cabinet.tax.gov.ua/cashregs/check?fn=${header.CASHREGISTERNUM}&id=${header.ORDERTAXNUM}&date=${formatDateForTax(header.ORDERDATE)}&time=${header.ORDERTIME}&sm=${totalSum}`
      : '';
  if (qrUrl) {
    // GS ( k — QR-код ESC/POS команда
    const qrData = qrUrl;
    const len = qrData.length + 3;
    const pL = len & 0xff;
    const pH = (len >> 8) & 0xff;
    out += `${GS}(k\x04\x00\x31\x41\x32\x00`; // model
    out += `${GS}(k\x03\x00\x31\x43\x05`;      // size
    out += `${GS}(k\x03\x00\x31\x45\x30`;      // error correction
    out += `${GS}(k${String.fromCharCode(pL)}${String.fromCharCode(pH)}\x31\x50\x30${qrData}`;
    out += `${GS}(k\x03\x00\x31\x51\x30`;      // print
  }

  out += LINE_FEED + LINE_FEED + LINE_FEED;
  out += CUT;

  return out;
}

// ────────────────────────────────────────────────────────────────
// 3c. ESC/POS складського чек-листа
// ────────────────────────────────────────────────────────────────

export function generateWarehouseChecklistEscPos(
  items: OrderChecklistItem[],
  orderInfo: WarehouseChecklistOrderInfo,
): string {
  let out = '';

  // RESET + вибір кодової сторінки CP866 (17 = 0x11) для кирилиці
  out += RESET;
  out += `${ESC}t\x11`;
  out += ALIGN_CENTER;
  out += BOLD_ON + 'СКЛАДСЬКИЙ ЧЕК-ЛІСТ' + LINE_FEED + BOLD_OFF;
  out += ALIGN_LEFT;
  out += divider();

  // Заголовок
  out += `Замовлення #${orderInfo.orderNumber}` + LINE_FEED;
  out += `Дата: ${currentDate()}, ${currentTime()}` + LINE_FEED;
  if (orderInfo.ttn) out += `ТТН: ${orderInfo.ttn.slice(0, 2)} ${orderInfo.ttn.slice(2, 6)} ${orderInfo.ttn.slice(6, 10)} ${orderInfo.ttn.slice(10, 14)}` + LINE_FEED;

  out += divider();

  // Список товарів (тільки продукти, без коробок)
  const productItems = items.filter((item) => item.type === 'product');
  productItems.forEach((item, idx) => {
    const num = padLeft(`${idx + 1}.`, 3);
    const qty = `x${item.quantity}`;
    const nameWidth = LINE_WIDTH - num.length - qty.length - 2;
    const name = item.name.length > nameWidth ? item.name.substring(0, nameWidth - 1) + '.' : padRight(item.name, nameWidth);

    out += `${num} ${name} ${qty}` + LINE_FEED;

    // Склад монолітного комплекту (відступ "    - " = 6 символів)
    if (item.composition && item.composition.length > 0) {
      // Доступна ширина після відступу "    - " (6 символів)
      const compWidth = LINE_WIDTH - 6;
      item.composition.forEach((comp) => {
        // Розбиваємо "Назва продукту x1" на назву і кількість
        const compMatch = comp.match(/^(.+?)\s+(x\d+)$/);
        if (compMatch) {
          const [, cName, cQty] = compMatch;
          // Залишаємо мінімум 1 пробіл між назвою і кількістю
          const maxNameLen = compWidth - cQty.length - 1;
          const truncName = cName.length > maxNameLen
            ? cName.substring(0, maxNameLen - 1) + '.'
            : cName;
          out += `    - ${rowSpaceBetween(truncName, cQty, compWidth)}` + LINE_FEED;
        } else {
          // Якщо формат нестандартний — просто обрізаємо
          const truncComp = comp.length > compWidth ? comp.substring(0, compWidth - 1) + '.' : comp;
          out += `    - ${truncComp}` + LINE_FEED;
        }
      });
    }
  });

  out += divider();

  // Підсумок
  const totalQty = productItems.reduce((sum, item) => sum + item.quantity * (item.portionsPerItem ?? 1), 0);
  out += `Позицій: ${productItems.length}   Одиниць: ${totalQty}` + LINE_FEED;

  out += LINE_FEED + LINE_FEED + LINE_FEED;
  out += CUT;

  return out;
}

// ────────────────────────────────────────────────────────────────
// 3d. HTML складського чек-листа (для перегляду в браузері)
// ────────────────────────────────────────────────────────────────

export function generateWarehouseChecklistHTML(
  items: OrderChecklistItem[],
  orderInfo: WarehouseChecklistOrderInfo,
): string {
  const productItems = items.filter((item) => item.type === 'product');
  const totalQty = productItems.reduce((sum, item) => sum + item.quantity * (item.portionsPerItem ?? 1), 0);

  const rowsHTML = productItems
    .map(
      (item) => `
    <tr>
      <td>
        <span style="font-size:13px; font-weight:bold;">${item.name}</span>
        ${
          item.composition && item.composition.length > 0
            ? `<ul style="list-style-type: none; margin:4px 0 0 14px; padding:0; font-size:11px; color:#333;">
                ${item.composition.map((c) => `<li>${c}</li>`).join('')}
               </ul>`
            : ''
        }
      </td>
      <td style="text-align:center; font-size:13px; width:40px;">${item.quantity}</td>
    </tr>
  `,
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Складський чек-ліст №${orderInfo.orderNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: "Courier New", Courier, monospace; font-size: 14px; padding: 20px; }
        h2 { font-size: 20px; margin-bottom: 6px; }
        .meta { font-size: 14px; color: #555; margin-bottom: 16px; }
				.meta p { margin-bottom: 4px; }
        table { width: 100%; border: none; border-collapse: collapse; margin-bottom: 12px; }
        th { background: #f0f0f0; font-weight: 600; text-align: left; }
        th, td { border-bottom: 1px solid #ccc; padding: 6px 8px; vertical-align: middle; }
				td:first-child { border-right: 1px solid #ccc; padding-left: 0; }
				td:last-child { padding-right: 0; }
				tr:last-child td { border-bottom: none; }
        .footer { font-size: 13px; color: #333; border-top: 2px solid #333; padding-top: 8px; }
        @media print {
          body { padding: 0; margin: 0; }
        }
      </style>
    </head>
    <body>
      <h2>Замовлення №${orderInfo.orderNumber}</h2>
      <div class="meta">
        <p>Дата: ${currentDate()} ${currentTime()}</p>
        ${orderInfo.ttn ? `<p>ТТН: ${orderInfo.ttn.slice(0, 2)} ${orderInfo.ttn.slice(2, 6)} ${orderInfo.ttn.slice(6, 10)} ${orderInfo.ttn.slice(10, 14)}</p>` : ''}
      </div>
      <table>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
      <div class="footer">
        Позицій: <strong>${productItems.length}</strong> &nbsp;&nbsp; Одиниць всього: <strong>${totalQty}</strong>
      </div>
      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `;
}
