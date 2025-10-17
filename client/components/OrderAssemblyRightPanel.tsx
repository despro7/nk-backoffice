import { useState, useEffect } from 'react';
import { Switch, cn } from '@heroui/react';
import { useEquipmentFromAuth } from '@/contexts/AuthContext';
import { ToastService } from '@/services/ToastService';
import { RightPanel } from './RightPanel';
import { WeightDisplayWidget } from './WeightDisplayWidget';
import { BoxSelector } from './BoxSelector';
import { DeviationButton } from './DeviationButton';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { ConfirmModal } from './modals/ConfirmModal';
import type { OrderForAssembly } from '../types/orderAssembly';
import { DynamicIcon } from 'lucide-react/dynamic';

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
  const [equipmentState, equipmentActions] = useEquipmentFromAuth();
  // Анімація перемикання
  const [autoPrintTransition, setAutoPrintTransition] = useState(false);
  const autoPrint = !!equipmentState.config?.printer?.autoPrintOnComplete;

  return (
    <>
      <div className="w-full xl:w-80 self-start sticky top-6">
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

          {/* Автоматичний друк */}
          <div className="flex w-full gap-3 -mt-4">
            <Switch
              isSelected={!!autoPrint}
              onValueChange={async (checked) => {
                setAutoPrintTransition(true);
                try {
                  const current = equipmentState.config;
                  if (!current) return;

                  const updatedPrinter = {
                    ...(current.printer || { enabled: false, name: '' }),
                    autoPrintOnComplete: checked,
                  };
                  const updatedConfig = {
                    ...current,
                    printer: updatedPrinter,
                  };
                  // Миттєво оновлюємо локальний стан
                  equipmentActions.updateConfig({ printer: updatedPrinter });
                  // Персистимо на бекенд
                  await equipmentActions.saveConfig(updatedConfig as any);
                  // Підтягнути свіжу конфігурацію для всіх споживачів (в т.ч. сторінки налаштувань)
                  await equipmentActions.refreshConfig();

                  ToastService.show({
                    title: 'Налаштування збережено',
                    description: `Автоматичний друк ${checked ? 'увімкнено' : 'вимкнено'}`,
                    color: 'success',
                    timeout: 3000,
                    hideIcon: false,
                    icon: <DynamicIcon name="printer" strokeWidth={2} />,
                    settingKey: 'equipmentStatus'
                  });
                } catch (error) {
                  ToastService.show({
                    title: 'Помилка збереження',
                    description: 'Не вдалося зберегти налаштування автодруку',
                    color: 'danger',
                    timeout: 3000,
                    hideIcon: false,
                    icon: <DynamicIcon name="printer" strokeWidth={2} />,
                    settingKey: 'equipmentStatus'
                  });
                } finally {
                  setTimeout(() => setAutoPrintTransition(false), 150);
                }
              }}
              color="danger"
              classNames={{
                base: cn(
                  "inline-flex flex-row-reverse w-full bg-white items-center max-w-full",
                  "justify-between cursor-pointer rounded-lg gap-3 px-2 py-4 pr-5",
                  "data-[selected=true]:ring-danger data-[selected=true]:ring-2",
                  "transition-transform duration-200 ease-in-out",
                  `${autoPrintTransition ? "opacity-75 scale-[0.98]" : "opacity-100 scale-100"}`
                ),
                wrapper: "p-0 h-4 overflow-visible",
                thumb: cn(
                  "w-6 h-6 border-2 shadow-lg",
                  "group-data-[hover=true]:border-danger",
                  // обраний
                  "group-data-[selected=true]:ms-6",
                  "group-data-[selected=true]:border-danger",
                  // натиснутий
                  "group-data-[pressed=true]:w-7",
                  "group-data-pressed:group-data-selected:ms-4",
                ),
              }}
            >
              <div className="flex items-center gap-2">
                <p className="text-medium font-semibold leading-[1.1]">Автодрук ТТН</p>
                <span className={`${autoPrint ? 'bg-danger text-white' : 'bg-grey-200'} rounded px-1 py-0.5 text-[10px] font-normal leading-normal self-start`}>{autoPrint ? 'ON' : 'OFF'}</span>
              </div>
            </Switch>
          </div>

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

