import { useState } from 'react';
import { useEquipmentFromAuth } from '@/contexts/AuthContext';
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
  averagePortionWeight?: number; // Середня вага порції для розподілу по коробках
  getWeightData: () => { expectedWeight: number | null; cumulativeTolerance: number };
  handleWeightChange: (weight: number | null) => void;
  isWeightWidgetActive: boolean;
  isWeightWidgetPaused: boolean;
  pollingMode: 'active' | 'reserve' | 'auto';
  handlePollingModeChange: (mode: 'active' | 'reserve') => void;
  handleBoxesChange: (boxes: any[], totalWeight: number, boxesInfo?: any) => void;
  activeBoxIndex: number;
  setActiveBoxIndex: (index: number) => void;
  hasItems: boolean;
  expandingSets: boolean;
  onPrintTTN: () => void;
  order: any;
  externalId: string;
  onOrderRefresh?: (updatedOrder: any) => void;
  /** Друк чека через QZ Tray */
  onPrintReceipt?: (type?: ReceiptType) => Promise<void>;
  /** Перегляд чека у браузері */
  onViewReceipt?: (type?: ReceiptType) => Promise<void>;
  /** Емуляція сканування ШК (Debug) */
  onBarcodeScan?: (code: string) => void;
}

export function OrderAssemblyRightPanel({
  orderForAssembly,
  averagePortionWeight = 0.33,
  getWeightData,
  handleWeightChange,
  isWeightWidgetActive,
  isWeightWidgetPaused,
  pollingMode,
  handlePollingModeChange,
  handleBoxesChange,
  activeBoxIndex,
  setActiveBoxIndex,
  hasItems,
  expandingSets,
  onPrintTTN,
  order,
  externalId,
  onOrderRefresh,
  onPrintReceipt,
  onViewReceipt,
  onBarcodeScan,
}: OrderAssemblyRightPanelProps) {
  const [showPrintConfirmModal, setShowPrintConfirmModal] = useState(false);
  const { expectedWeight, cumulativeTolerance } = getWeightData();
  const [equipmentState, equipmentActions] = useEquipmentFromAuth();
  const { isDebugMode } = useDebug();
  const [debugScanCode, setDebugScanCode] = useState('');
  // Анімація перемикання
  const [autoPrintTransition, setAutoPrintTransition] = useState(false);
  const autoPrint = !!equipmentState.config?.printer?.autoPrintOnComplete;

  const receiptConfig = equipmentState.config?.receiptPrinter;

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

          {/* Селектор коробок */}
          {hasItems && !expandingSets && (
            <BoxSelector
              totalPortions={orderForAssembly.totalPortions}
              averagePortionWeight={averagePortionWeight}
              onBoxesChange={handleBoxesChange}
              onActiveBoxChange={setActiveBoxIndex}
              activeBoxIndex={activeBoxIndex}
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
        message={`Ви дійсно хочете роздрукувати ТТН ${order?.ttn || ''} для замовлення №${order?.orderNumber || externalId}?`}
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

