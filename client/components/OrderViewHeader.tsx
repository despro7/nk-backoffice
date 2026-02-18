import { Button, Chip, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate, getStatusColor, getStatusLabel } from '../lib/formatUtils';
import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { ToastService } from '../services/ToastService';

interface OrderViewHeaderProps {
  order: any;
  externalId: string;
  onBackClick: () => void;
}

// Іконка шеврону для dropdown
const ChevronDownIcon = () => (
  <svg fill="none" height="14" viewBox="0 0 24 24" width="14" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M17.9188 8.17969H11.6888H6.07877C5.11877 8.17969 4.63877 9.33969 5.31877 10.0197L10.4988 15.1997C11.3288 16.0297 12.6788 16.0297 13.5088 15.1997L15.4788 13.2297L18.6888 10.0197C19.3588 9.33969 18.8788 8.17969 17.9188 8.17969Z"
      fill="currentColor"
    />
  </svg>
);

export function OrderViewHeader({ order, externalId, onBackClick }: OrderViewHeaderProps) {
  const { apiCall } = useApi();
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [receiptNotAvailable, setReceiptNotAvailable] = useState(false);
  const [receiptsList, setReceiptsList] = useState<any[]>([]);
  const [selectedReceiptIndex, setSelectedReceiptIndex] = useState(new Set(["0"]));
  const [loadingReceiptsList, setLoadingReceiptsList] = useState(false);

  // Завантажуємо список чеків при появі dilovodDocId
  useEffect(() => {
    if (order.dilovodDocId) {
      loadReceiptsList();
    }
  }, [order.dilovodDocId]);

  const loadReceiptsList = async () => {
    try {
      setLoadingReceiptsList(true);
      const response = await apiCall(`/api/orders/${order.id}/fiscal-receipts/list`);
      const data = await response.json();

      if (data.success && data.data?.receipts) {
        setReceiptsList(data.data.receipts);
        
        // Якщо знайдено кілька чеків, показуємо повідомлення
        if (data.data.receipts.length > 1) {
          ToastService.show({
            title: 'Знайдено кілька чеків',
            description: `Доступно ${data.data.receipts.length} чеків для цього замовлення`,
            color: 'primary'
          });
        }
      }
    } catch (error) {
      console.error('Помилка завантаження списку чеків:', error);
      // Не показуємо toast, якщо просто немає чеків
    } finally {
      setLoadingReceiptsList(false);
    }
  };

  const handleFetchReceipt = async (index?: number) => {
    
    try {
      setLoadingReceipt(true);
      setReceiptNotAvailable(false);

      // Визначаємо індекс чека (якщо не передано, беремо з вибраного)
      const receiptIndex = index !== undefined ? index : parseInt(Array.from(selectedReceiptIndex)[0]);

      // Спочатку пробуємо отримати чек з Dilovod
      const url = `/api/orders/${order.id}/fiscal-receipt${receiptIndex > 0 ? `?index=${receiptIndex}` : ''}`;
      const response = await apiCall(url);
      const data = await response.json();

      if (data.success && data.data?.receipt) {
        // Генеруємо HTML для нового вікна
        const receiptData = data.data.receipt;
        const receiptHTML = generateReceiptHTML(receiptData, order.orderNumber || externalId);
        
        // Відкриваємо нове вікно
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (printWindow) {
          printWindow.document.write(receiptHTML);
          printWindow.document.close();
        }
      } else {
        // Якщо чек з Dilovod не вийшов, пробуємо альтернативний PDF (тільки для sajt == 19)
        if (order.sajt == 19 && externalId) {
          await tryOpenWordPressPDF(externalId);
        } else {
          // Чек не сформовано і немає альтернативи
          setReceiptNotAvailable(true);
          ToastService.show({
            title: 'Фіскальний чек',
            description: data.message || 'Чек ще не сформовано',
            color: 'warning'
          });
        }
      }
    } catch (error) {
      console.error('Помилка отримання чека:', error);
      
      // При помилці теж пробуємо альтернативний PDF (тільки для sajt == 19)
      if (order.sajt === 19 && externalId) {
        await tryOpenWordPressPDF(externalId);
      } else {
        setReceiptNotAvailable(true);
        ToastService.show({
          title: 'Помилка',
          description: 'Не вдалося отримати фіскальний чек',
          color: 'danger'
        });
      }
    } finally {
      setLoadingReceipt(false);
    }
  };

  // Функція для спроби відкрити PDF чек з WordPress
  const tryOpenWordPressPDF = async (externalId: string) => {
    try {
      // Спочатку перевіряємо, чи існує PDF через наш API
      const checkResponse = await apiCall(`/api/wordpress-receipt/check/${externalId}`);
      const checkData = await checkResponse.json();

      if (checkData.success && checkData.exists) {
        // PDF існує, відкриваємо його
        const pdfUrl = `https://nk-food.shop/wp-content/plugins/checkbox-pro/receipts-pdf/receipts/${externalId}.pdf#zoom=25`;
        window.open(pdfUrl, '_blank', 'width=800,height=600');
        
        ToastService.show({
          title: 'Чек з WordPress',
          description: 'Відкрито альтернативний чек',
          color: 'success'
        });
      } else {
        // PDF не існує
        setReceiptNotAvailable(true);
        ToastService.show({
          title: 'Чек недоступний',
          description: 'Не вдалося знайти жодного чека для цього замовлення',
          color: 'warning'
        });
      }
    } catch (error) {
      console.error('Помилка перевірки WordPress PDF:', error);
      setReceiptNotAvailable(true);
      ToastService.show({
        title: 'Помилка',
        description: 'Не вдалося перевірити наявність альтернативного чека',
        color: 'danger'
      });
    }
  };

  // Функція для генерації HTML чека (скопійована з ReceiptPreview)
  const generateReceiptHTML = (receiptData: any, orderNumber: string) => {
    const { header, goods, totals, payments, taxes } = receiptData;

    const formatPrice = (value: number | undefined) => {
      if (value === undefined || value === null) return '0.00';
      return Number(value).toFixed(2);
    };

    const formatDate = (dateStr: string | undefined) => {
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
    };

    const formatDateForTax = (dateStr: string | undefined) => {
      if (!dateStr) return '';
      if (/^\d{8}$/.test(dateStr)) {
        const day = dateStr.substring(0, 2);
        const month = dateStr.substring(2, 4);
        const year = dateStr.substring(4, 8);
        return `${year}${month}${day}`;
      }
      return dateStr;
    };

    const formatTime = (timeStr: string | undefined) => {
      if (!timeStr) return '';
      if (/^\d{2}-\d{2}-\d{2}$/.test(timeStr)) return timeStr;
      if (/^\d{6}$/.test(timeStr)) {
        const hours = timeStr.substring(0, 2);
        const minutes = timeStr.substring(2, 4);
        const seconds = timeStr.substring(4, 6);
        return `${hours}-${minutes}-${seconds}`;
      }
      return timeStr;
    };

    const qrUrl = header.CASHREGISTERNUM && header.ORDERTAXNUM && header.ORDERDATE && header.ORDERTIME
      ? `https://cabinet.tax.gov.ua/cashregs/check?fn=${header.CASHREGISTERNUM}&id=${header.ORDERTAXNUM}&date=${formatDateForTax(header.ORDERDATE)}&time=${header.ORDERTIME}&sm=${totals.SUM || payments.SUM || 0}`
      : '';

    const goodsHTML = goods && goods.length > 0
      ? goods.map((item: any) => {
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
        <title>Фіскальний чек №${orderNumber}</title>
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

  return (
    <>
      <div className="flex items-center gap-4 max-w-[calc(theme(maxWidth.5xl)+theme(spacing.80)+theme(spacing.8))]">
        <Button
          color="secondary"
          variant="flat"
          className="text-neutral-500 min-w-fit"
          onPress={onBackClick}
        >
          <DynamicIcon name="arrow-left" size={20} />
        </Button>
        <div className="flex items-end gap-2 text-primary font-inter text-3xl font-semibold leading-[100%] tracking-[-0.64px]">
          <span>Замовлення №{order.orderNumber || externalId}</span>
          {order.orderDate && (<span className="font-normal text-xl ml-2 text-gray-500">від {formatDate(order.orderDate)}</span>)}
        </div>
        {order.status && (
          <Chip
            size="md"
            variant="flat"
            classNames={{
              base: getStatusColor(order.status) + " shadow-container",
              content: "font-semibold",
            }}
          >
            {getStatusLabel(order.status)}
          </Chip>
        )}

        {/* Кнопка отримання фіскального чека */}
        {order.dilovodDocId && (
          <div className="ml-auto">
            {receiptsList.length > 1 ? (
              // Якщо є кілька чеків - показуємо ButtonGroup з dropdown
              <ButtonGroup variant="flat">
                <Button
                  color={receiptNotAvailable ? "default" : "primary"}
                  onPress={() => handleFetchReceipt()}
                  isLoading={loadingReceipt}
                  isDisabled={!order.dilovodDocId || loadingReceiptsList}
                  startContent={!loadingReceipt && <DynamicIcon name="receipt" size={18} />}
                  className={`min-w-fit ${receiptNotAvailable ? 'bg-danger-50 text-danger-500' : 'bg-primary text-white hover:bg-primary/90'}`}
                >
                  {receiptNotAvailable 
                    ? 'Чек не сформовано' 
                    : receiptsList.find(r => r.index === parseInt(Array.from(selectedReceiptIndex)[0]))?.summary || 'Переглянути чек'
                  }
                </Button>
                <Dropdown placement="bottom-end">
                  <DropdownTrigger>
                    <Button
                      isIconOnly
                      color={receiptNotAvailable ? "default" : "primary"}
                      isDisabled={!order.dilovodDocId || loadingReceiptsList}
                      className={receiptNotAvailable ? 'bg-danger-50 text-danger-500' : 'bg-primary text-white hover:bg-primary/90'}
                    >
                      <ChevronDownIcon />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    disallowEmptySelection
                    aria-label="Вибір фіскального чека"
                    className="max-w-[400px]"
                    selectedKeys={selectedReceiptIndex}
                    selectionMode="single"
                    onSelectionChange={(keys) => setSelectedReceiptIndex(keys as Set<string>)}
                  >
                    {receiptsList.map((receipt) => (
                      <DropdownItem key={receipt.index.toString()}>
                        {receipt.summary}
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>
              </ButtonGroup>
            ) : (
              // Якщо один чек або ще завантажується - звичайна кнопка
              <Button
                color={receiptNotAvailable ? "default" : "primary"}
                variant="flat"
                onPress={() => handleFetchReceipt()}
                isLoading={loadingReceipt || loadingReceiptsList}
                isDisabled={!order.dilovodDocId}
                startContent={!loadingReceipt && !loadingReceiptsList && <DynamicIcon name="receipt" size={18} />}
                className={`min-w-fit ${receiptNotAvailable ? 'bg-danger-50 text-danger-500' : 'bg-primary text-white hover:bg-primary/90'}`}
              >
                {receiptNotAvailable ? 'Чек не сформовано' : 'Переглянути чек'}
              </Button>
            )}
          </div>
        )}

        {/* Попередження про відсутність dilovodDocId */}
        {!order.dilovodDocId && (
          <div className="text-center text-xs text-red-600 ml-auto w-auto px-2.5 py-1.5 rounded-sm border border-red-400 bg-red-100">
            Замовлення не експортоване в Dilovod
          </div>
        )}
      </div>
    </>
  );
}


