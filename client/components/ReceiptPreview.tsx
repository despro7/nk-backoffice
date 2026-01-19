import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface ReceiptHeader {
  POINTNM?: string;
  POINTADDR?: string;
  ORDERNUM?: string;
  ORDERDATE?: string;
  ORDERTIME?: string;
  CASHIER?: string;
  ORDERTAXNUM?: string;
  RRN?: string;
  [key: string]: any;
}

interface ReceiptGood {
  NAME?: string;
  AMOUNT?: number;
  PRICE?: number;
  COST?: number;
  [key: string]: any;
}

interface ReceiptTotals {
  SUM?: number;
  [key: string]: any;
}

interface ReceiptPayments {
  PAYFORMNM?: string;
  SUM?: number;
  [key: string]: any;
}

interface ReceiptTaxes {
  NAME?: string;
  LETTER?: string;
  [key: string]: any;
}

interface ReceiptData {
  header: ReceiptHeader;
  goods: ReceiptGood[];
  totals: ReceiptTotals;
  payments: ReceiptPayments;
  taxes: ReceiptTaxes;
}

interface ReceiptPreviewProps {
  receiptData: ReceiptData;
  orderNumber?: string;
}

export function ReceiptPreview({ receiptData, orderNumber }: ReceiptPreviewProps) {
  const { header, goods, totals, payments, taxes } = receiptData;

	// const json = header.json || [];
	// const payments = header.json.payments?.[0] || [];

  // Тимчасово для відладки
  // console.log('🧾 [ReceiptPreview] RAW дані:', { header, goods, totals, payments, taxes });

  // Форматування числа до 2 знаків після коми
  const formatPrice = (value: number | undefined) => {
    if (value === undefined || value === null) return '0.00';
    return Number(value).toFixed(2);
  };

  // Форматування дати в формат DD.MM.YYYY з формату DDMMYYYY
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    
    // Якщо дата вже в потрібному форматі, повертаємо як є
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) return dateStr;
    
    // Якщо дата в форматі DDMMYYYY (наприклад, "14012026")
    if (/^\d{8}$/.test(dateStr)) {
      const day = dateStr.substring(0, 2);
      const month = dateStr.substring(2, 4);
      const year = dateStr.substring(4, 8);
      return `${day}.${month}.${year}`;
    }
    
    // Інакше намагаємось розпарсити як ISO дату
    try {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    } catch {
      return dateStr;
    }
  };

	// Форматування дати в формат YYYYMMDD з формату DDMMYYYY
	const formatDateForTax = (dateStr: string | undefined) => {
		if (!dateStr) return '';
		// Якщо дата в форматі DDMMYYYY (наприклад, "14012026")
		if (/^\d{8}$/.test(dateStr)) {
			const day = dateStr.substring(0, 2);
			const month = dateStr.substring(2, 4);
			const year = dateStr.substring(4, 8);
			return `${year}${month}${day}`;
		}	
		return dateStr;
	}

  // Форматування часу в формат HH-MM-SS з формату HHMMSS
  const formatTime = (timeStr: string | undefined) => {
    if (!timeStr) return '';
    
    // Якщо час вже в потрібному форматі, повертаємо як є
    if (/^\d{2}-\d{2}-\d{2}$/.test(timeStr)) return timeStr;
    
    // Якщо час в форматі HHMMSS (наприклад, "175423")
    if (/^\d{6}$/.test(timeStr)) {
      const hours = timeStr.substring(0, 2);
      const minutes = timeStr.substring(2, 4);
      const seconds = timeStr.substring(4, 6);
      return `${hours}-${minutes}-${seconds}`;
    }
    
    return timeStr;
  };

  // Функція для генерації HTML чека
  const generateReceiptHTML = () => {
    const qrUrl = header.CASHREGISTERNUM && header.ORDERTAXNUM && header.ORDERDATE && header.ORDERTIME
      ? `https://cabinet.tax.gov.ua/cashregs/check?fn=${header.CASHREGISTERNUM}&id=${header.ORDERTAXNUM}&date=${formatDateForTax(header.ORDERDATE)}&time=${header.ORDERTIME}&sm=${totals.SUM || payments.SUM || 0}`
      : '';

    const goodsHTML = goods && goods.length > 0
      ? goods.map((item) => {
          const amount = item.AMOUNT || 0;
          const price = item.PRICE || 0;
          const cost = item.COST || (amount * price);
          
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
        }).join('')
      : '<div style="text-align: center; color: #6b7280;">Немає товарів</div>';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Фіскальний чек ${orderNumber ? '№' + orderNumber : ''}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
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
          .text-center {
            text-align: center;
          }
          .font-bold {
            font-weight: bold;
          }
          .border-b {
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .border-dashed {
            border-bottom: 1px dashed #9ca3af;
            margin: 8px 0;
          }
          .flex {
            display: flex;
          }
          .justify-between {
            justify-content: space-between;
          }
          .mt-1 {
            margin-top: 4px;
          }
          .mb-1 {
            margin-bottom: 4px;
          }
          .mb-2 {
            margin-bottom: 8px;
          }
          .pb-2 {
            padding-bottom: 8px;
          }
          .pt-2 {
            padding-top: 8px;
          }
          .text-sm {
            font-size: 10px;
          }
          .text-lg {
            font-size: 14px;
          }
          .qr-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            margin-bottom: 8px;
          }
          @media print {
            body {
              padding: 0;
            }
            .receipt {
              border: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <!-- Шапка чека -->
          <div class="text-center border-b">
            <div class="font-bold">ФОП ${header.ORGNM || ''}</div>
            ${header.POINTNM ? `<div>${header.POINTNM}</div>` : ''}
            ${header.POINTADDR ? `<div class="mt-1">${header.POINTADDR}</div>` : ''}
            ${header.TIN ? `<div class="mt-1">ІД ${header.TIN}</div>` : ''}
          </div>

          <!-- Таблиця товарів -->
          <div class="mb-2">
            ${goodsHTML}
          </div>

          <!-- Розділювач -->
          <div class="border-dashed"></div>

          <!-- Додаткова інформація -->
          ${payments ? `
            <div class="text-sm mb-2">
              <div>Продаж</div>
              ${payments.PAYSYS?.cardMask ? `<div class="flex justify-between"><span>ЕПЗ</span> ${payments.PAYSYS.cardMask}</div>` : ''}
              ${payments.PAYSYS?.NAME ? `<div class="flex justify-between"><span>ПЛАТІЖНА СИСТЕМА</span> ${payments.PAYSYS.NAME}</div>` : ''}
              ${payments.PAYSYS?.rrn ? `<div class="flex justify-between"><span>RRN</span> ${payments.PAYSYS.rrn}</div>` : ''}
              ${payments.PAYFORMNM === "Післяплата" 
                ? `<div class="flex justify-between"><span>Післяплата</span> ${formatPrice(payments.SUM)} ГРН</div>` 
                : `<div class="flex justify-between"><span>Безготівкова</span> <span>${formatPrice(payments.SUM)} ГРН<br/>${payments.PAYFORMNM || ''}</span></div>`
              }
            </div>
          ` : ''}

          <!-- Підсумок -->
          <div class="border-b">
            <div class="flex justify-between font-bold text-lg">
              <span>СУМА</span>
              <span>${formatPrice(totals.SUM || payments.SUM || 0)} ГРН</span>
            </div>
            ${taxes ? `<div>${taxes.NAME || ''} ${taxes.LETTER || ''}</div>` : ''}
          </div>

          <!-- Номер замовлення -->
          ${orderNumber ? `
            <div class="text-center border-b">
              <div>Замовлення №${orderNumber}</div>
            </div>
          ` : ''}

          <!-- Фіскальна інформація -->
          <div class="text-center mb-2">
            ${header.ORDERTAXNUM ? `<div class="mb-1">Чек № ${header.ORDERTAXNUM}</div>` : ''}
            <div class="flex justify-between">
              <span>${formatDate(header.ORDERDATE)}</span>
              <span>${formatTime(header.ORDERTIME)}</span>
            </div>
          </div>

          <!-- QR код -->
          ${qrUrl ? `
            <div class="qr-container">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(qrUrl)}" alt="QR код" />
              <div class="text-center font-bold">ОНЛАЙН</div>
            </div>
          ` : ''}

          <!-- Футер -->
          <div class="text-center text-sm border-b pt-2">
            ${header.CASHREGISTERNUM ? `<div class="flex justify-between"><span>ФН ПРРО</span> <span>${header.CASHREGISTERNUM}</span></div>` : ''}
            ${header.taxAccount ? `<div>ФІСКАЛЬНИЙ ЧЕК</div>` : ''}
          </div>
        </div>
        <script>
          // Автоматично відкрити діалог друку після завантаження
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;
  };

  // Функція для відкриття нового вікна з чеком
  const handlePrintReceipt = () => {
    const printWindow = window.open('', '_blank', 'width=400,height=800');
    if (printWindow) {
      printWindow.document.write(generateReceiptHTML());
      printWindow.document.close();
    }
  };

  return (
    <Button 
      color="primary"
      onPress={handlePrintReceipt}
      startContent={<DynamicIcon name="printer" size={18} />}
    >
      Роздрукувати чек
    </Button>
  );
}
