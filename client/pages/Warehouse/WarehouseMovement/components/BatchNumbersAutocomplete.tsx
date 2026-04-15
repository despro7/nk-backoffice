import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, Button } from '@heroui/react';
import { motion } from 'framer-motion';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { BatchNumber } from '../hooks/useBatchNumbers';

interface BatchNumbersAutocompleteProps {
  batches: BatchNumber[];
  isOpen: boolean;
  isLoading: boolean;
  selectedBatch: string;
  selectedStorage: string;
  selectedDateTime?: Date;
  /** Ключі вже доданих партій у форматі "batchId:storage" (крім поточної редагованої) */
  addedBatchKeys?: Set<string>;
  onSelect: (batch: BatchNumber) => void;
  onClose: () => void;
  /** Примусово оновити партії з Dilovod (скинути серверний кеш) */
  onRefresh: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}

/**
 * Drawer компонент для вибору партії (bottom sheet)
 * Показує список доступних партій з залишками по складах
 */
export const BatchNumbersAutocomplete = ({
  batches,
  isOpen,
  isLoading,
  selectedBatch,
  selectedStorage,
  selectedDateTime,
  addedBatchKeys,
  onSelect,
  onClose,
  onRefresh,
  inputRef
}: BatchNumbersAutocompleteProps) => {
  const displayDate = selectedDateTime ?? new Date();
  const dateStr = displayDate.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = displayDate.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  return (
    <Drawer isOpen={isOpen} onOpenChange={(open) => {
      if (!open) {
        // Коли Drawer закривається, видаляємо фокус з input щоб не тригерити onFocus знову
        if (inputRef?.current) {
          inputRef.current.blur();
        }
        onClose();
      }
    }} size="sm" placement="left">
      <DrawerContent>
        {(onCloseDrawer) => (
          <>
            <DrawerHeader className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <DynamicIcon name="box" size={20} className="text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">Виберіть партію</h2>
                </div>
              </div>
            </DrawerHeader>

            <DrawerBody className="overflow-y-auto">
							<p className="text-sm font-normal text-gray-600 mb-3">
                Партії з залишками на складі <b>Готової продукції</b> доступні на <b>{dateStr}, {timeStr}</b>
              </p>
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="animate-spin">
                    <DynamicIcon name="loader-circle" size={32} className="text-blue-500" />
                  </div>
                  <p className="text-gray-600">Завантаження партій...</p>
                </div>
              ) : batches.length > 0 ? (
                <div className="space-y-3 pb-4">
                  {batches.map((batch, index) => {
                    const isSelected = selectedBatch === batch.batchNumber && selectedStorage === batch.storage;
                    const isAlreadyAdded = addedBatchKeys?.has(`${batch.batchId}:${batch.storage}`) ?? false;
                    return (
                      <motion.button
                        key={`${batch.batchNumber}-${batch.storage}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        disabled={isAlreadyAdded}
                        onClick={() => {
                          if (isAlreadyAdded) return;
                          onSelect(batch);
                          // Видаляємо фокус з input щоб не переоткривати Drawer
                          if (inputRef?.current) {
                            inputRef.current.blur();
                          }
                          onClose();
                        }}
                        className={`w-full px-4 py-4 text-left rounded-lg transition-all border-2 ${
                          isAlreadyAdded
                            ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-start gap-2">
                              <span className="font-semibold text-gray-900">
                                Партія: {batch.batchNumber}
                              </span>
                              {isSelected && (
                                <DynamicIcon name="check-circle" size={18} className="text-blue-600 shrink-0" />
                              )}
                              {isAlreadyAdded && (
                                <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                                  Вже додано
                                </span>
                              )}
                            </div>
                            
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <DynamicIcon name="warehouse" size={14} className="text-gray-400" />
                                <span className="text-gray-600">{batch.storageDisplayName}</span>
                                <span className="font-semibold text-blue-600">
                                  {batch.quantity.toFixed(2)} шт
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs">
                                <DynamicIcon name="building" size={13} className="text-gray-400" />
                                <span className="text-gray-500">{batch.firmDisplayName}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <DynamicIcon name="inbox" size={32} className="text-gray-300" />
                  <p className="text-gray-600 text-center">
                    Партії не знайдені для цього товару
                  </p>
                </div>
              )}
            </DrawerBody>

            <DrawerFooter className="gap-2">
              <Button
                variant="light"
                isLoading={isLoading}
                onPress={onRefresh}
                title="Оновити залишки з Dilovod"
                className="text-gray-400 hover:text-blue-500 hover:bg-blue-100!"
                startContent={!isLoading && <DynamicIcon name="refresh-cw" size={16} />}
              >
                Оновити залишки
              </Button>
              <Button
                color="default"
                variant="bordered"
                className="flex-1"
                onPress={() => {
                  if (inputRef?.current) {
                    inputRef.current.blur();
                  }
                  onClose();
                }}
              >
                Закрити
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
};