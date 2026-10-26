import { useEffect, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import ResizableAppDrawer from '@/components/drawer/ResizableAppDrawer';
import type { WarehouseDocumentEditContextResponse } from '@shared/types/warehouseDocumentEdit';
import { useWarehouseReturns } from '@/pages/Warehouse/WarehouseReturns/useWarehouseReturns';
import WarehouseDetails from '@/pages/Warehouse/shared/WarehouseDetails';
import useWarehouseParams from '@/pages/Warehouse/shared/useWarehouseParams';
import DilovodDocumentViewSections from './DilovodDocumentViewSections';
import type { ReturnHistoryRecord } from '@/pages/Warehouse/WarehouseReturns/WarehouseReturnsTypes';
import { ReturnsItemRow } from '@/pages/Warehouse/WarehouseReturns/components/ReturnsItemRow';

const DRAWER_WIDTH_KEY = 'warehouse-document-edit-drawer-width-v1';
const STACK_LEVEL = 1;

const noopQuantity = () => {};
const noopBatch = () => {};

async function hydrateReturnSession(
  returns: ReturnType<typeof useWarehouseReturns>,
  record: ReturnHistoryRecord,
) {
  const parsedItems = record.items || [];
  returns.setSearchQuery(record.orderNumber);
  returns.setComment(record.comment || '');
  returns.setReturnReason(record.returnReason);
  returns.setCustomReason(record.customReason || '');
  const returnAmount = (record as ReturnHistoryRecord & { returnAmount?: string | number }).returnAmount;
  returns.setReturnAmount(returnAmount != null ? String(returnAmount) : '');
  returns.setShipFirmId?.(record.shipFirmId ?? record.firmId ?? null);
  returns.setShipFirmName?.(record.shipFirmName ?? '');
  returns.setReceiveFirmId?.(record.receiveFirmId ?? record.firmId ?? null);
  returns.setReceiveFirmName?.(record.receiveFirmName ?? '');
  await returns.handleSearch();
  returns.setItems([]);
  const newItems = parsedItems.map((item: Record<string, unknown>) => ({
    id: crypto.randomUUID?.() ?? `${item.sku}-${Date.now()}`,
    sku: String(item.sku ?? ''),
    name: String(item.name ?? ''),
    dilovodId: null,
    quantity: Number(item.quantity ?? 0),
    orderedQuantity: Number(item.quantity ?? 0),
    portionsPerBox: 1,
    firmId: record.shipFirmId ?? record.firmId,
    availableBatches: null,
    selectedBatchId: null,
    selectedBatchKey: null,
    price: Number(item.price ?? 0),
  }));
  returns.setItems(newItems);
}

interface SaleReturnDilovodEditDrawerProps {
  isOpen: boolean;
  title: string;
  context: WarehouseDocumentEditContextResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export default function SaleReturnDilovodEditDrawer({
  isOpen,
  title,
  context,
  loading,
  error,
  onClose,
}: SaleReturnDilovodEditDrawerProps) {
  const returns = useWarehouseReturns();
  const { storages, selectedStorage, setSelectedStorage } = useWarehouseParams({ returns });
  const [initialized, setInitialized] = useState(false);
  const [hydrating, setHydrating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setInitialized(false);
      return;
    }
    if (!context?.localRecord || initialized) return;

    let cancelled = false;
    setHydrating(true);
    void hydrateReturnSession(returns, context.localRecord as ReturnHistoryRecord)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setHydrating(false);
          setInitialized(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, context, initialized, returns]);

  let body: React.ReactNode;
  if (loading || hydrating) {
    body = <Spinner label="Завантаження повернення..." className="py-16" />;
  } else if (error) {
    body = <p className="text-sm text-danger">{error}</p>;
  } else if (!context?.localRecord) {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Запис повернення в backoffice не знайдено. Нижче — таблична частина з Діловода.
        </p>
        <DilovodDocumentViewSections dilovod={context?.dilovod ?? null} title="Повернення" hideHeader tableOnly />
      </div>
    );
  } else {
    const record = context.localRecord as ReturnHistoryRecord;
    body = (
      <div className="space-y-4">
        <Card className="rounded-xl border border-gray-200 bg-white shadow-small">
          <CardHeader className="text-lg font-medium text-gray-900">
            <DynamicIcon name="info" size={20} className="mr-1" />
            Деталі повернення
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <WarehouseDetails
              returns={returns}
              storages={storages}
              selectedStorage={selectedStorage}
              setSelectedStorage={setSelectedStorage}
              variant="writeOff"
            />
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <div className="text-xs text-gray-500">Причина</div>
                <div className="font-medium">{record.returnReason || '—'}</div>
              </div>
              {record.customReason ? (
                <div>
                  <div className="text-xs text-gray-500">Уточнення</div>
                  <div className="font-medium">{record.customReason}</div>
                </div>
              ) : null}
              {(record as ReturnHistoryRecord & { returnAmount?: string | number }).returnAmount != null ? (
                <div>
                  <div className="text-xs text-gray-500">Сума зворотної доставки</div>
                  <div className="font-medium">
                    {(record as ReturnHistoryRecord & { returnAmount?: string | number }).returnAmount}
                  </div>
                </div>
              ) : null}
              {record.comment ? (
                <div className="sm:col-span-2">
                  <div className="text-xs text-gray-500">Коментар</div>
                  <div className="font-medium">{record.comment}</div>
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card className="rounded-xl border border-gray-200 bg-white shadow-small">
          <CardHeader className="text-lg font-semibold text-gray-900">
            <DynamicIcon name="package" size={20} className="mr-1" />
            Товари для повернення
          </CardHeader>
          <CardBody>
            {(returns.items?.length ?? 0) > 0 ? (
              returns.items.map((item) => (
                <ReturnsItemRow
                  key={item.id}
                  item={item}
                  onQuantityChange={noopQuantity}
                  onBatchChange={noopBatch}
                />
              ))
            ) : (
              <DilovodDocumentViewSections dilovod={context.dilovod} title="Повернення" hideHeader tableOnly />
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <ResizableAppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      initialPlacement="right"
      stackLevel={STACK_LEVEL}
      widthStorageKey={DRAWER_WIDTH_KEY}
      defaultWidth={920}
      minWidth={640}
      maxWidth={1200}
      resizeAriaLabel="Змінити ширину панелі документа"
      footer={<Button variant="light" onPress={onClose}>Закрити</Button>}
    >
      {body}
    </ResizableAppDrawer>
  );
}
