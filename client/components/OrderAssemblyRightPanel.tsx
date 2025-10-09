import { useState } from 'react';
import { RightPanel } from './RightPanel';
import { WeightDisplayWidget } from './WeightDisplayWidget';
import { BoxSelector } from './BoxSelector';
import { DeviationButton } from './DeviationButton';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { ConfirmModal } from './modals/ConfirmModal';
import type { OrderForAssembly } from '../types/orderAssembly';

interface OrderAssemblyRightPanelProps {
  orderForAssembly: OrderForAssembly;
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
}

export function OrderAssemblyRightPanel({
  orderForAssembly,
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
  externalId
}: OrderAssemblyRightPanelProps) {
  const [showPrintConfirmModal, setShowPrintConfirmModal] = useState(false);
  const { expectedWeight, cumulativeTolerance } = getWeightData();

  return (
    <>
      <div className="w-full xl:w-80">
        <RightPanel>
          {/* OrderTrackingNumber */}
          <div className="w-full">
            <div 
              className="bg-neutral-50 p-4 rounded-lg cursor-pointer hover:bg-neutral-100 transition-colors active:scale-[0.98] transform"
              onClick={() => setShowPrintConfirmModal(true)}
              title="Натисніть для друку ТТН"
            >
              <div className="flex items-center gap-2.5 text-2xl font-mono tracking-wider text-primary">
                {formatTrackingNumberWithIcon(orderForAssembly.shipping.trackingId, {
                  provider: orderForAssembly.shipping.provider,
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
              onBoxesChange={handleBoxesChange}
              onActiveBoxChange={setActiveBoxIndex}
              activeBoxIndex={activeBoxIndex}
              className="bg-white p-6 rounded-lg shadow"
            />
          )}

          {/* Кнопка для позначення відхилень */}
          <DeviationButton />
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

