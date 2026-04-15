import { Button, Chip, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSection } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate, getStatusColor, getStatusLabel } from '../lib/formatUtils';
import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { ToastService } from '../services/ToastService';

interface OrderViewHeaderProps {
  order: any;
  externalId: string;
  onBackClick: () => void;
  /** Друк фіскального чека через QZ Tray (з підтримкою receiptIndex для вибору конкретного чека) */
  onPrintReceipt?: (receiptIndex?: number) => Promise<void>;
  /** Перегляд фіскального чека у браузері (з підтримкою receiptIndex) */
  onViewReceipt?: (receiptIndex?: number) => Promise<void>;
  /** Друк складського чек-листа (для комплектувальника) через QZ Tray */
  onPrintWarehouseChecklist?: () => Promise<void>;
  /** Перегляд складського чек-листа у браузері */
  onViewWarehouseChecklist?: () => Promise<void>;
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

export function OrderViewHeader({ order, externalId, onBackClick, onPrintReceipt, onViewReceipt, onPrintWarehouseChecklist, onViewWarehouseChecklist }: OrderViewHeaderProps) {
  const { apiCall } = useApi();
  const [isPrinting, setIsPrinting] = useState(false);
  const [receiptsList, setReceiptsList] = useState<any[]>([]);
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

        if (data.data.receipts.length > 1) {
          ToastService.show({
            title: 'Знайдено кілька чеків',
            description: `Доступно ${data.data.receipts.length} чеків для цього замовлення`,
            color: 'primary',
          });
        }
      }
    } catch (error) {
      console.error('Помилка завантаження списку чеків:', error);
    } finally {
      setLoadingReceiptsList(false);
    }
  };

  /** Обгортка для друку з індикацією завантаження */
  const handlePrint = async (receiptIndex = 0) => {
    if (!onPrintReceipt) return;
    setIsPrinting(true);
    try {
      await onPrintReceipt(receiptIndex);
    } finally {
      setIsPrinting(false);
    }
  };

  /** Перегляд (preview) чека у браузері */
  const handleView = async (receiptIndex = 0) => {
    await onViewReceipt?.(receiptIndex);
  };

  /** Друк складського чек-листа через QZ Tray */
  const handlePrintWarehouse = async () => {
    setIsPrinting(true);
    try {
      await onPrintWarehouseChecklist?.();
    } finally {
      setIsPrinting(false);
    }
  };

  /** Перегляд складського чек-листа у браузері */
  const handleViewWarehouse = async () => {
    await onViewWarehouseChecklist?.();
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

        {/* Кнопки чека */}
        {order.dilovodDocId && (
          <div className="ml-auto">
            {receiptsList.length > 1 ? (
              // Кілька чеків: ButtonGroup з основною кнопкою (друк першого) + dropdown по кожному
              <ButtonGroup variant="flat">
                <Button
                  color="primary"
                  onPress={() => handlePrint(receiptsList[0]?.index ?? 0)}
                  isLoading={isPrinting}
                  isDisabled={loadingReceiptsList}
                  startContent={!isPrinting && <DynamicIcon name="printer" size={18} />}
                  className="min-w-fit bg-primary text-white hover:bg-primary/90"
                >
                  {receiptsList[0]?.summary || 'Друкувати чек'}
                </Button>
                <Dropdown placement="bottom-end">
                  <DropdownTrigger>
                    <Button
                      isIconOnly
                      color="primary"
                      isDisabled={loadingReceiptsList}
                      className="bg-primary text-white hover:bg-primary/90"
                    >
                      <ChevronDownIcon />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="Дії з чеками" className="max-w-[400px]">
                    <DropdownSection title="Фіскальні чеки">
                      {receiptsList.flatMap((receipt) => [
                        <DropdownItem
                          key={`print-${receipt.index}`}
                          startContent={<DynamicIcon name="printer" size={16} />}
                          onPress={() => handlePrint(receipt.index)}
                        >
                          Друкувати: {receipt.summary}
                        </DropdownItem>,
                        <DropdownItem
                          key={`view-${receipt.index}`}
                          startContent={<DynamicIcon name="receipt" size={16} />}
                          onPress={() => handleView(receipt.index)}
                        >
                          Переглянути: {receipt.summary}
                        </DropdownItem>,
                      ])}
                    </DropdownSection>
                    {(onPrintWarehouseChecklist || onViewWarehouseChecklist) && (
                      <DropdownSection title="Чек комплектувальника">
                        {onPrintWarehouseChecklist ? (
                          <DropdownItem
                            key="warehouse-print"
                            startContent={<DynamicIcon name="clipboard-list" size={16} />}
                            onPress={handlePrintWarehouse}
                          >
                            Друкувати чек комплектувальника
                          </DropdownItem>
                        ) : null}
                        {onViewWarehouseChecklist ? (
                          <DropdownItem
                            key="warehouse-view"
                            startContent={<DynamicIcon name="eye" size={16} />}
                            onPress={handleViewWarehouse}
                          >
                            Переглянути чек комплектувальника
                          </DropdownItem>
                        ) : null}
                      </DropdownSection>
                    )}
                  </DropdownMenu>
                </Dropdown>
              </ButtonGroup>
            ) : (
              // Один чек: основна кнопка = друк, dropdown зі стрілкою = preview
              <ButtonGroup variant="flat">
                <Button
                  color="primary"
                  onPress={() => handlePrint(0)}
                  isLoading={isPrinting || loadingReceiptsList}
                  isDisabled={loadingReceiptsList}
                  startContent={!isPrinting && !loadingReceiptsList && <DynamicIcon name="printer" size={18} />}
                  className="min-w-fit bg-primary text-white hover:bg-primary/90"
                >
                  Друкувати чек
                </Button>
                <Dropdown placement="bottom-end">
                  <DropdownTrigger>
                    <Button
                      isIconOnly
                      color="primary"
                      isDisabled={isPrinting || loadingReceiptsList}
                      className="bg-primary text-white hover:bg-primary/90"
                    >
                      <ChevronDownIcon />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="Перегляд чека">
                    <DropdownSection title="Фіскальний чек">
                      <DropdownItem
                        key="view"
                        startContent={<DynamicIcon name="receipt" size={16} />}
                        onPress={() => handleView(0)}
                      >
                        Переглянути чек
                      </DropdownItem>
                    </DropdownSection>
                    {(onPrintWarehouseChecklist || onViewWarehouseChecklist) && (
                      <DropdownSection title="Чек комплектувальника">
                        {onPrintWarehouseChecklist ? (
                          <DropdownItem
                            key="warehouse-print"
                            startContent={<DynamicIcon name="clipboard-list" size={16} />}
                            onPress={handlePrintWarehouse}
                          >
                            Друкувати чек комплектувальника
                          </DropdownItem>
                        ) : null}
                        {onViewWarehouseChecklist ? (
                          <DropdownItem
                            key="warehouse-view"
                            startContent={<DynamicIcon name="eye" size={16} />}
                            onPress={handleViewWarehouse}
                          >
                            Переглянути чек комплектувальника
                          </DropdownItem>
                        ) : null}
                      </DropdownSection>
                    )}
                  </DropdownMenu>
                </Dropdown>
              </ButtonGroup>
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

