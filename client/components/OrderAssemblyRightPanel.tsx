import { useState, useMemo } from 'react';
import { Card, CardBody, CardHeader, Switch, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { useDebug } from '@/contexts/DebugContext';
import { RightPanel } from './RightPanel';
import { WeightDisplayWidget } from './WeightDisplayWidget';
import { BoxSelector } from './BoxSelector';
import { DeviationButton } from './DeviationButton';
import { OrderRefreshButton } from './OrderRefreshButton';
import { ActiveProductSets } from './ActiveProductSets';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { ConfirmModal } from './modals/ConfirmModal';
import { shippingClientService } from '../services/ShippingService';
import type { OrderForAssembly } from '../types/orderAssembly';
import type { ReceiptType } from '@/hooks/useReceiptPrinting';
import { DynamicIcon } from 'lucide-react/dynamic';

interface OrderAssemblyRightPanelProps {
  orderForAssembly: OrderForAssembly;
  monolithicDisplayItems?: OrderForAssembly['items'];
  monolithicDisplayStates?: Record<string, boolean>;
  averagePortionWeight?: number; // Середня вага порції для розподілу по коробках
  getWeightData: () => { expectedWeight: number | null; cumulativeTolerance: number };
  handleWeightChange: (weight: number | null) => void;
  isWeightWidgetActive: boolean;
  isWeightWidgetPaused: boolean;
  pollingMode: 'active' | 'reserve' | 'auto';
  handlePollingModeChange: (mode: 'active' | 'reserve') => void;
  assemblyMode?: 'standard' | 'no_scales';
  handleBoxesChange: (boxes: any[], totalWeight: number, boxesInfo?: any) => void;
  activeBoxIndex: number;
  setActiveBoxIndex: (index: number) => void;
  hasItems: boolean;
  expandingSets: boolean;
  onPrintTTN: () => void;
  order: any;
  onOrderRefresh?: (updatedOrder: any) => void;
  onMonolithicDisplayChange?: (itemKey: string, enabled: boolean) => void;
  /** Друк чека через QZ Tray */
  onPrintReceipt?: (type?: ReceiptType) => Promise<void>;
  /** Перегляд чека у браузері */
  onViewReceipt?: (type?: ReceiptType) => Promise<void>;
  /** Емуляція сканування ШК (Debug) */
  onBarcodeScan?: (code: string) => void;
}

export function OrderAssemblyRightPanel({
  orderForAssembly,
  monolithicDisplayItems,
  monolithicDisplayStates,
  averagePortionWeight = 0.33,
  getWeightData,
  handleWeightChange,
  isWeightWidgetActive,
  isWeightWidgetPaused,
  pollingMode,
  handlePollingModeChange,
  assemblyMode,
  handleBoxesChange,
  activeBoxIndex,
  setActiveBoxIndex,
  hasItems,
  expandingSets,
  onPrintTTN,
  order,
  onOrderRefresh,
  onMonolithicDisplayChange,
  onBarcodeScan,
}: OrderAssemblyRightPanelProps) {
  const [showPrintConfirmModal, setShowPrintConfirmModal] = useState(false);
  const { expectedWeight, cumulativeTolerance } = getWeightData();
  const { isDebugMode } = useDebug();
  const [debugScanCode, setDebugScanCode] = useState('');
  const monolithicDisplayControlItems = useMemo(() => {
    const sourceItems = monolithicDisplayItems || orderForAssembly.items;
    return sourceItems.filter((item) => {
      return item.type === 'product' && typeof item.portionsPerItem === 'number' && item.portionsPerItem > 16;
    });
  }, [monolithicDisplayItems, orderForAssembly.items]);
  const isMonolithicOnlyOrder = useMemo(() => {
    const productItems = orderForAssembly.items.filter((item) => item.type === 'product');
    return productItems.length > 0 && productItems.every((item) => typeof item.portionsPerItem === 'number' && item.portionsPerItem > 16);
  }, [orderForAssembly.items]);

  return (
    <>
      <div className="w-full xl:w-80 self-start sticky top-6">
        <RightPanel>
          {/* OrderTrackingNumber */}
          <div className="w-full">
            <div className="bg-neutral-50 p-4 rounded-lg cursor-pointer hover:bg-neutral-100 transition-colors active:scale-[0.98] transform"
              title="Натисніть для друку ТТН"
              // onClick={() => setShowPrintConfirmModal(true)}
              onClick={async () => {
                await shippingClientService.viewTTN({
                  ttn: order?.ttn || orderForAssembly.shipping.trackingId,
                  provider: order?.provider || orderForAssembly.shipping.provider,
                  senderId: order?.rawData?.ord_delivery_data?.[0]?.senderId || 1,
                });
              }}
            >
              <div className="flex items-center justify-center gap-2.5 text-2xl font-mono text-primary">
                {formatTrackingNumberWithIcon(orderForAssembly.shipping.trackingId, {
                  provider: orderForAssembly.shipping.provider,
                  autoDetectProvider: !orderForAssembly.shipping.provider, // Автовизначення якщо provider не вказаний
                  iconSize: 'absolute',
                  iconSizeValue: '1.5rem',
                })}
              </div>
            </div>
          </div>

          {/* Віджет поточної ваги */}
          {assemblyMode !== 'no_scales' && (
            <WeightDisplayWidget
              onWeightChange={handleWeightChange}
              expectedWeight={expectedWeight}
              cumulativeTolerance={cumulativeTolerance}
              className="w-full"
              isActive={isWeightWidgetActive}
              isPaused={isWeightWidgetPaused}
              pollingMode={pollingMode}
              onPollingModeChange={handlePollingModeChange}
            />
          )}

          {/* Селектор коробок */}
          {hasItems && !expandingSets && (
            <BoxSelector
              totalPortions={orderForAssembly.totalPortions}
              averagePortionWeight={averagePortionWeight}
              onBoxesChange={handleBoxesChange}
              onActiveBoxChange={setActiveBoxIndex}
              activeBoxIndex={activeBoxIndex}
              isSingleLargeMonolithicOrder={isMonolithicOnlyOrder}
              className="bg-white p-6 rounded-lg shadow"
            />
          )}

          {/* Емулятор сканера (Debug) */}
          {isDebugMode && onBarcodeScan && (
            <div className="w-full border-2 border-dashed border-warning-400 rounded-lg p-3 bg-warning-50">
              <p className="text-xs font-semibold text-warning-700 mb-2 flex items-center gap-1">
                <DynamicIcon name="scan-barcode" size={14} />
                Емулятор сканера [DEBUG]
              </p>
              <input
                type="text"
                value={debugScanCode}
                onChange={e => setDebugScanCode(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && debugScanCode.trim()) {
                    onBarcodeScan(debugScanCode.trim());
                    setDebugScanCode('');
                  }
                }}
                placeholder="ШК / SKU і Enter..."
                className="w-full text-sm px-3 py-1.5 rounded border border-warning-300 bg-white focus:outline-none focus:border-warning-500 font-mono"
                autoComplete="off"
              />
            </div>
          )}

          {/* Активні комплекти */}
          {order?.items && (
            <ActiveProductSets orderItems={order.items} />
          )}

          {/* Перемикач монолітних комплектів */}
          {monolithicDisplayControlItems.length > 0 && (
            <Card classNames={{
              base: 'w-full shadow-none bg-lime-600/80 rounded-[18px] p-1 border',
              header: 'text-sm text-lime-950 font-medium pt-1.5 pb-2 px-2 text-white flex items-center gap-1.5',
              body: 'bg-white gap-2 rounded-[14px] shadow',
            }}>
              <CardHeader>
                <DynamicIcon name="package-open" size={16} strokeWidth={1.5} className="text-white shrink-0" />
                Готовий комплект
                <Popover showArrow offset={20} placement="top" classNames={{ base: 'before:bg-neutral-600', trigger: 'focus:outline-none cursor-pointer', content: 'bg-neutral-600 text-white max-w-2xs p-3' }}>
                  <PopoverTrigger>
                    <DynamicIcon name="info" size={16} className="shrink-0" />
                  </PopoverTrigger>
                  <PopoverContent>
                    Зібрані набори можна провести як монолітні комплекти, або як звичайні набори. Використовуйте цей перемикач для відображення/приховування таких товарів у списку.
                  </PopoverContent>
                </Popover>
              </CardHeader>
              <CardBody className="gap-3">
                {monolithicDisplayControlItems.map((item) => {
                  const itemKey = item.sku || item.id;
                  const isSelected = monolithicDisplayStates?.[itemKey] ?? true;

                  return (
                    <div key={itemKey} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0 text-sm font-medium text-neutral-800">
                        <span className="truncate">{item.name}</span>
                      </div>
                      <Switch
                        size="sm"
                        isSelected={isSelected}
                        onValueChange={(enabled) => onMonolithicDisplayChange?.(itemKey, enabled)}
                        classNames={{
                          wrapper: 'group-data-[selected=true]:bg-lime-600',
                          base: 'transition-all',
                        }}
                      />
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          )}

          {/* Кнопка для позначення відхилень */}
          <DeviationButton />

          {/* Кнопка оновлення замовлення */}
          <OrderRefreshButton
            orderId={order?.id}
            lastSynced={order?.lastSynced}
            onRefreshComplete={onOrderRefresh}
          />
        </RightPanel>
      </div>

      {/* Модальне вікно підтвердження друку ТТН */}
      <ConfirmModal
        isOpen={showPrintConfirmModal}
        title="Підтвердження друку ТТН"
        message={`Ви дійсно хочете роздрукувати ТТН ${order?.ttn || ''} для замовлення №${order?.orderNumber || orderForAssembly.id}?`}
        confirmText="Так, друкувати"
        cancelText="Скасувати"
        onConfirm={() => {
          setShowPrintConfirmModal(false);
          onPrintTTN();
        }}
        onCancel={() => setShowPrintConfirmModal(false)}
      />
    </>
  );
}

