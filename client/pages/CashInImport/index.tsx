import React, { useState, useCallback } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import FileUploadZone from './components/FileUploadZone';
import CashInPreviewTable from './components/CashInPreviewTable';
import CashInSummary from './components/CashInSummary';
import type { CashInRow, CashInPreviewResponse, CashInConfirmedRow } from '@shared/types/cashIn';

// Крок імпорту
type Step = 'upload' | 'preview' | 'done';

const STEP_LABELS: Record<Step, string> = {
  upload: '1. Завантаження файлу',
  preview: '2. Перевірка даних',
  done: '3. Результат',
};

export default function CashInImport() {
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<CashInRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ exported: number; errors: number } | null>(null);

  // Стан модального вікна Payload (debug)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [payloadData, setPayloadData] = useState<any | null>(null);

  // --- Крок 1: завантаження файлу → POST /preview ---
  const handleFileSelect = useCallback(async (file: File) => {
    setIsParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/dilovod/cash-in/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Помилка сервера' }));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }

      const data: CashInPreviewResponse = await res.json();
      setRows(data.rows);
      setStep('preview');
    } catch (err: any) {
      ToastService.show({ title: 'Помилка парсингу', description: err.message, color: 'danger' });
    } finally {
      setIsParsing(false);
    }
  }, []);

  // --- Крок 2: inline-редагування рядка ---
  const handleResolve = useCallback((rowIndex: number, patch: Partial<CashInRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r))
    );
  }, []);

  // --- Крок 3: відправка в Діловод → POST /export ---
  const handleExport = useCallback(async (confirmedRows: CashInConfirmedRow[]) => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/dilovod/cash-in/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rows: confirmedRows }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Помилка сервера' }));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setExportResult({ exported: data.exportedCount, errors: data.errors?.length ?? 0 });
      setStep('done');

      if (data.exportedCount > 0) {
        ToastService.show({ title: 'Успіх', description: `Відправлено ${data.exportedCount} документів в Діловод`, color: 'success' });
      }
      if (data.errors?.length > 0) {
        ToastService.show({ title: 'Увага', description: `${data.errors.length} рядків не вдалося відправити`, color: 'warning' });
      }
    } catch (err: any) {
      ToastService.show({ title: 'Помилка відправки', description: err.message, color: 'danger' });
    } finally {
      setIsExporting(false);
    }
  }, []);

  // --- Debug: показати Payload ---
  const handleShowPayload = useCallback(async (confirmedRows: CashInConfirmedRow[]) => {
    try {
      const res = await fetch('/api/dilovod/cash-in/export?dryRun=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rows: confirmedRows }),
      });

      const data = await res.json();
      setPayloadData(data);
    } catch (err: any) {
      ToastService.show({ title: 'Помилка payload', description: err.message, color: 'danger' });
    }
  }, []);

  // --- Скидання стану ---
  const handleReset = useCallback(() => {
    setRows([]);
    setExportResult(null);
    setStep('upload');
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Заголовок секції */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <DynamicIcon name="file-input" size={18} className="text-primary" />
          Імпорт реєстру переказів (Надходження грошей)
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Завантажте Excel-файл реєстру переказів. Дані будуть перевірені та вивантажені в Діловод як документ «Надходження грошей».
        </p>
      </div>

      {/* Індикатор кроків */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        {(Object.keys(STEP_LABELS) as Step[]).map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <DynamicIcon name="chevron-right" size={13} className="text-gray-300" />}
            <span className={step === s ? 'text-primary font-semibold' : ''}>
              {STEP_LABELS[s]}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Крок 1: Upload */}
      {step === 'upload' && (
        <FileUploadZone onFileSelect={handleFileSelect} isLoading={isParsing} />
      )}

      {/* Крок 2: Preview */}
      {step === 'preview' && (
        <div className="flex flex-col gap-5">
          <CashInPreviewTable rows={rows} onResolve={handleResolve} />
          <CashInSummary
            rows={rows}
            isExporting={isExporting}
            onExport={handleExport}
            onShowPayload={handleShowPayload}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Крок 3: Done */}
      {step === 'done' && exportResult && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center">
            <DynamicIcon name="circle-check" size={36} className="text-success-600" />
          </div>
          <p className="text-base font-medium text-gray-800">
            Імпорт завершено
          </p>
          <p className="text-sm text-gray-500">
            Відправлено: <b>{exportResult.exported}</b> документів
            {exportResult.errors > 0 && (
              <> · <span className="text-warning-600">Помилок: {exportResult.errors}</span></>
            )}
          </p>
          <Button variant="flat" color="primary" onPress={handleReset} startContent={<DynamicIcon name="rotate-ccw" size={15} />}>
            Новий імпорт
          </Button>
        </div>
      )}

      {/* Модальне вікно Payload (debug) */}
      <PayloadPreviewModal
        isOpen={!!payloadData}
        onClose={() => setPayloadData(null)}
        payload={payloadData}
        title="Cash-In Payload (dry-run)"
      />
    </div>
  );
}
