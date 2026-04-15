import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState } from 'react';
import type { MovementProduct } from '../../shared/WarehouseMovementTypes';
import type { DilovodMovementPayload } from '@shared/types/movement';

// ---------------------------------------------------------------------------
// PayloadPreviewModal — перегляд готового payload (отриманого з сервера)
// ---------------------------------------------------------------------------

interface PayloadPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Готовий payload, побудований на сервері (dry-run відповідь) */
  payload: DilovodMovementPayload | null;
  /** Для відображення товарів у вкладці "Товари" */
  summaryItems: MovementProduct[];
  /** Показується в заголовку модалки */
  internalDocNumber?: string | number;
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
  isLoading = false,
  isSending = false,
  onSend,
}: PayloadPreviewModalProps) => {
  const [activeTab, setActiveTab] = useState<'full' | 'params' | 'items'>('full');

  if (!payload) return null;

  const fullRequestJson = JSON.stringify(payload, null, 2);
  const headersJson = JSON.stringify(payload.header, null, 2);
  const tpGoods = payload.tableParts.tpGoods;


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
                <h2 className="text-xl font-semibold">Перегляд Payload (API Request)</h2>
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
                <div className="flex gap-2 border-b border-gray-200">
                  {(['full', 'params', 'items'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        activeTab === tab
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab === 'full' && 'Повний запит'}
                      {tab === 'params' && 'Параметри'}
                      {tab === 'items' && `Товари (${tpGoods.length})`}
                    </button>
                  ))}
                </div>

                {/* Вкладка: Повний JSON */}
                {activeTab === 'full' && (
                  <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                      <p className="text-xs font-mono text-gray-300">POST /api/warehouse/movements/send</p>
                    </div>
                    <pre className="p-4 text-xs overflow-auto max-h-[350px] font-mono text-gray-200">
                      {fullRequestJson}
                    </pre>
                  </div>
                )}

                {/* Вкладка: Параметри заголовку */}
                {activeTab === 'params' && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-sm mb-3">📄 Заголовок документа</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Дата:</span>
                          <p className="font-mono text-gray-800">{payload.header.date}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Номер:</span>
                          <p className="font-mono text-gray-800">{payload.header.number ?? '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Склад (з):</span>
                          <p className="font-mono text-gray-800">{payload.header.storage}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Склад (в):</span>
                          <p className="font-mono text-gray-800">{payload.header.storageTo}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Підприємство:</span>
                          <p className="font-mono text-gray-800">{payload.header.firm}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Режим документа:</span>
                          <p className="font-mono text-gray-800">{payload.header.docMode}</p>
                        </div>
                        {payload.header.author && (
                          <div>
                            <span className="text-gray-600">Автор:</span>
                            <p className="font-mono text-gray-800">{payload.header.author}</p>
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

                {/* Вкладка: Товари */}
                {activeTab === 'items' && (
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
