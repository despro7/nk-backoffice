import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import type { ReleaseSendSummary } from '@shared/types/warehouseRelease';
import { getReleaseSendExplanation, getReleaseSendTitle, type ReleaseConfirmMode } from '../releaseConfirmCopy';

interface Props {
  isOpen: boolean;
  mode: ReleaseConfirmMode;
  summary: ReleaseSendSummary | null;
  warnings?: string[];
  isSubmitting: boolean;
  result: Record<string, unknown> | null;
  sendDisabled?: boolean;
  kitBatchPreviewLoading?: boolean;
  sendLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ReleaseSendConfirmModal({
  isOpen,
  mode,
  summary,
  warnings = [],
  isSubmitting,
  result,
  sendDisabled = false,
  kitBatchPreviewLoading = false,
  sendLabel,
  onConfirm,
  onClose,
}: Props) {
  const success = Boolean(result?.success);
  const title = getReleaseSendTitle(mode);
  const explanation = summary ? getReleaseSendExplanation(mode, summary) : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" backdrop="blur" scrollBehavior="inside" isDismissable={!isSubmitting}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="text-xl font-semibold">{title}</div>
          {summary && <div className="text-sm font-normal text-gray-500">{explanation}</div>}
        </ModalHeader>

        <ModalBody className="gap-4">
          {summary ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Набір / товар</span>
                <span className="font-semibold text-gray-900 text-right">{summary.setName || summary.setSku}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">SKU</span>
                <span className="font-semibold text-gray-900">{summary.setSku}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Кількість</span>
                <span className="font-semibold text-gray-900">{summary.quantity} шт.</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Склад</span>
                <span className="font-semibold text-gray-900 text-right">{summary.storageName ?? summary.storageId ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Дата операції</span>
                <span className="font-semibold text-gray-900 text-right">{summary.operDate ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Примітка</span>
                <span className="font-semibold text-gray-900 text-right">{summary.remark ?? '—'}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
              Немає даних для підтвердження.
            </div>
          )}

          {summary && summary.components.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Компонент</th>
                    <th className="px-3 py-2">Потрібно</th>
                    <th className="px-3 py-2">Партії</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.components.map((component) => (
                    <tr key={component.sku} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{component.name || component.sku}</div>
                        <div className="text-xs text-gray-500">{component.sku}</div>
                      </td>
                      <td className="px-3 py-2 font-semibold">{component.quantity}</td>
                      <td className="px-3 py-2">
                        {(component.batches ?? []).length > 0 ? (
                          <div className="space-y-1">
                            {(component.batches ?? []).map((batch, batchIndex) => (
                              <div key={`${component.sku}-${batch.batchId}-${batchIndex}`} className="text-xs text-gray-700">
                                {batch.batchNumber || batch.batchId} → <span className="font-semibold">{batch.quantity}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">без партій</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mode === 'kit' && kitBatchPreviewLoading && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Перевіряємо партію комплекту…
            </div>
          )}

          {mode === 'kit' && summary?.kitOutputBatch?.batchNumber && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-1">
              <div>
                Партія набору: <strong>{summary.kitOutputBatch.batchNumber}</strong>
                {summary.kitOutputBatch.created ? ' (нова)' : ' (існуюча)'}
              </div>
              {summary.kitOutputBatch.expiration && (
                <div>Термін придатності: <strong>{summary.kitOutputBatch.expiration}</strong></div>
              )}
              {summary.kitOutputBatch.barcode && (
                <div>Штрих-код: <span className="font-mono">{summary.kitOutputBatch.barcode}</span></div>
              )}
              {summary.kitOutputBatch.created && !summary.kitOutputBatch.barcode && (
                <div>Буде згенеровано новий штрих-код.</div>
              )}
            </div>
          )}

          {mode === 'correctionUnkit' && summary && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 space-y-1">
              <div>Очікувана кількість: <strong>{summary.expectedTotal ?? 0}</strong></div>
              <div>Порахована кількість: <strong>{summary.countedTotal ?? 0}</strong></div>
              {(summary.shortage ?? 0) > 0 && (
                <div className="text-red-700">Недостача: <strong>{summary.shortage}</strong> порцій</div>
              )}
              {(summary.surplus ?? 0) > 0 && (
                <div className="text-amber-800">
                  Надлишок: <strong>{summary.surplus}</strong> порцій.
                  {summary.surplusBatchName ? ` Буде створена нова партія «${summary.surplusBatchName}».` : ''}
                </div>
              )}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900 space-y-1">
              {warnings.map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          )}

          {result && (
            <div className={`rounded-xl border p-4 text-sm ${success ? 'border-lime-500/50 bg-lime-200 text-lime-800' : 'border-red-300/75 bg-red-200/80 text-red-900'}`}>
              <div className="text-lg font-semibold mb-2">
                {success ? 'Відправка успішно виконана!' : 'Відправка не вдалася'}
              </div>
              <div className="space-y-1">
                <div className="opacity-80">Оновлення залишків: {result.stockSyncTriggered ? 'запущено' : 'не запущено'}</div>
                {result.error && <div>Помилка: {String(result.error)}</div>}
                {result.errorFallback && <div>Деталі: {String(result.errorFallback)}</div>}
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter className="gap-2">
          <Button variant="light" onPress={onClose} isDisabled={isSubmitting}>
            {success ? 'Закрити' : 'Скасувати'}
          </Button>
          {!success && (
            <Button color="primary" onPress={onConfirm} isLoading={isSubmitting} isDisabled={isSubmitting || sendDisabled || !summary}>
              {sendLabel}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
