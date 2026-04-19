import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState } from 'react';
import { ToastService } from '@/services/ToastService';
import type { MovementProduct } from '@/pages/Warehouse/WarehouseMovement/WarehouseMovementTypes';
import type { DilovodMovementPayload } from '@shared/types/movement';

// ---------------------------------------------------------------------------
// PayloadPreviewModal — публічний компонент перегляду payload (dry-run).
// Працює як з DilovodMovementPayload (складські переміщення),
// так і з довільними об'єктами (напр. Cash-In імпорт).
// ---------------------------------------------------------------------------

interface PayloadPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Payload для відображення. Може бути будь-яким JSON-серіалізованим об'єктом. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: DilovodMovementPayload | Record<string, any> | null;
  /** Для відображення товарів у вкладці "Товари" (тільки для складських переміщень) */
  summaryItems?: MovementProduct[];
  /** Показується в заголовку модалки */
  internalDocNumber?: string | number;
  /** Заголовок модалки (за замовчуванням — "Перегляд Payload") */
  title?: string;
  isLoading?: boolean;
  isSending?: boolean;
  /** Коллбек фактичної відправки (dryRun=false) */
  onSend?: () => void;
}

export const PayloadPreviewModal = ({
  isOpen,
  onClose,
  payload,
  summaryItems,
  internalDocNumber,
  title = 'Перегляд Payload (API Request)',
  isLoading = false,
  isSending = false,
  onSend,
}: PayloadPreviewModalProps) => {
  const [activeTab, setActiveTab] = useState<'full' | 'params' | 'items'>('full');

  if (!payload) return null;

  // Вкладка "Параметри" доступна тільки якщо payload — це DilovodMovementPayload (є header)
  const hasHeader = 'header' in payload && typeof payload.header === 'object';
  // Вкладка "Товари" доступна тільки якщо є список товарів
  const hasItems = Array.isArray(summaryItems) && summaryItems.length > 0;

  const movementPayload = hasHeader ? (payload as DilovodMovementPayload) : null;
  const tpGoods = movementPayload?.tableParts?.tpGoods ?? [];

  const fullRequestJson = JSON.stringify(payload, null, 2);
  const headersJson = hasHeader ? JSON.stringify(movementPayload!.header, null, 2) : '';

  const availableTabs = [
    { key: 'full' as const, label: 'Повний запит', show: true },
    { key: 'params' as const, label: 'Параметри', show: hasHeader },
    { key: 'items' as const, label: `Товари (${tpGoods.length})`, show: hasItems },
  ].filter((t) => t.show);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      scrollBehavior="inside"
      backdrop="blur"
    >
      <ModalContent>
        {(onModalClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 flex-col sm:flex-row">
              <div>
                <h2 className="text-xl font-semibold">{title}</h2>
                {internalDocNumber != null && (
                  <p className="text-xs text-gray-500 font-normal mt-1">
                    Повний запит до Діловода для документа #{internalDocNumber}
                  </p>
                )}
              </div>
            </ModalHeader>

            <ModalBody className="gap-4">
              {/* Інформаційна плашка */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <DynamicIcon name="info" className="w-4 h-4 inline mr-2" />
                Payload сформовано сервером. Відправка передасть ці дані до Діловода.
              </div>

              {/* Таби */}
              <div className="space-y-3">
                {availableTabs.length > 1 && (
                  <div className="flex gap-2 border-b border-gray-200">
                    {availableTabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-3 py-2 text-sm font-medium transition-colors ${
                          activeTab === tab.key
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Вкладка: Повний JSON */}
                {activeTab === 'full' && (
                  <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                      <p className="text-xs font-mono text-gray-300">dry-run payload</p>
                    </div>
                    <pre className="p-4 text-xs overflow-auto max-h-[350px] font-mono text-gray-200">
                      {fullRequestJson}
                    </pre>
                  </div>
                )}

                {/* Вкладка: Параметри заголовку (тільки для DilovodMovementPayload) */}
                {activeTab === 'params' && movementPayload && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-sm mb-3">📄 Заголовок документа</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Дата:</span>
                          <p className="font-mono text-gray-800">{movementPayload.header.date}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Номер:</span>
                          <p className="font-mono text-gray-800">{movementPayload.header.number ?? '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Склад (з):</span>
                          <p className="font-mono text-gray-800">{movementPayload.header.storage}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Склад (в):</span>
                          <p className="font-mono text-gray-800">{movementPayload.header.storageTo}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Підприємство:</span>
                          <p className="font-mono text-gray-800">{movementPayload.header.firm}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Режим документа:</span>
                          <p className="font-mono text-gray-800">{movementPayload.header.docMode}</p>
                        </div>
                        {movementPayload.header.author && (
                          <div>
                            <span className="text-gray-600">Автор:</span>
                            <p className="font-mono text-gray-800">{movementPayload.header.author}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-900 p-4 rounded-lg font-mono text-xs text-gray-100 overflow-auto max-h-48">
                      <p className="text-gray-400 mb-2">header (JSON):</p>
                      <pre>{headersJson}</pre>
                    </div>
                  </div>
                )}

                {/* Вкладка: Товари (тільки для DilovodMovementPayload) */}
                {activeTab === 'items' && summaryItems && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-800">
                      📦 Товари для переміщення ({tpGoods.length}):
                    </p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-200 border-b border-gray-300">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">SKU</th>
                            <th className="px-3 py-2 text-left font-semibold">Назва</th>
                            <th className="px-3 py-2 text-left font-semibold">Партія</th>
                            <th className="px-3 py-2 text-right font-semibold">Коробки</th>
                            <th className="px-3 py-2 text-right font-semibold">Порції</th>
                            <th className="px-3 py-2 text-right font-semibold">Всього (шт)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summaryItems.flatMap((item) =>
                            item.details.batches.map((batch, batchIdx) => (
                              <tr
                                key={`${item.id}-${batchIdx}`}
                                className="border-b border-gray-200 hover:bg-gray-100"
                              >
                                <td className="px-3 py-2 text-gray-800 font-mono">{item.sku}</td>
                                <td className="px-3 py-2 text-gray-800 truncate max-w-[150px]">{item.name}</td>
                                <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-[100px]">
                                  {batch.batchNumber}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-800 font-semibold">{batch.boxes}</td>
                                <td className="px-3 py-2 text-right text-gray-800 font-semibold">{batch.portions}</td>
                                <td className="px-3 py-2 text-right text-gray-800 font-semibold">
                                  {batch.boxes * item.portionsPerBox + batch.portions}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </ModalBody>

            <ModalFooter className="gap-2">
              {/* Кнопка копіювання JSON */}
              <Button
                size="sm"
                variant="flat"
                startContent={<DynamicIcon name="copy" size={14} />}
                onPress={() => {
                  navigator.clipboard.writeText(fullRequestJson);
                  ToastService.show({ title: 'Скопійовано', description: 'Payload скопійовано в буфер обміну', color: 'success' });
                }}
              >
                Копіювати
              </Button>
              <Button color="default" variant="light" onPress={onModalClose} isDisabled={isSending}>
                Закрити
              </Button>
              {onSend && (
                <Button
                  color="primary"
                  isLoading={isSending}
                  isDisabled={isLoading || isSending}
                  onPress={() => {
                    onSend();
                    onModalClose();
                  }}
                  startContent={!isSending && <DynamicIcon name="send" size={15} />}
                >
                  Відправити до Діловода
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
