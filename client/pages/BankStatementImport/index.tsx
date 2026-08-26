import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import Timeline, { type TimelineStep } from '@/components/Timeline';
import { useDebug } from '@/contexts/DebugContext';
import FileUploadZone from '../CashInImport/components/FileUploadZone';
import BankStatementPreviewTable from './components/BankStatementPreviewTable';
import BankStatementSummary from './components/BankStatementSummary';
import ParseSettingsPanel from './components/ParseSettingsPanel';
import type {
  BankStatementConfirmedRow,
  BankStatementDirection,
  BankStatementInlineColumn,
  BankStatementParseMapping,
  BankStatementPreviewResponse,
  BankStatementRawSampleRow,
  BankStatementRow,
  BankStatementTemplate,
} from '@shared/types/bankStatement';
import {
  DEFAULT_BANK_STATEMENT_MAPPING,
  DEFAULT_BANK_STATEMENT_TEMPLATE,
  defaultCashItem,
  defaultSettlementsKind,
  toBankStatementConfirmed,
} from '@shared/types/bankStatement';
import {
  addKeywordsToDict,
  applySettlementsKindKeywords,
  learnUniqueKeywords,
} from '@shared/utils/settlementsKindKeywords';

type Step = 'upload' | 'preview' | 'done';

const TIMELINE_STEPS: TimelineStep[] = [
  { key: 'upload', label: 'Завантаження', icon: 'file-up' },
  { key: 'preview', label: 'Перевірка', icon: 'list-checks' },
  { key: 'done', label: 'Результат', icon: 'circle-check' },
];

function toggleRowDirection(row: BankStatementRow): BankStatementRow {
  const next: BankStatementDirection = row.direction === 'expense' ? 'income' : 'expense';
  let amount = row.amount;
  if (next === 'expense' && row.debitAmount > 0) amount = row.debitAmount;
  if (next === 'income' && row.creditAmount > 0) amount = row.creditAmount;
  const prevKind = defaultSettlementsKind(row.direction);
  const settlementsKind = !row.settlementsKind || row.settlementsKind === prevKind
    ? defaultSettlementsKind(next)
    : row.settlementsKind;
  const prevCashItem = defaultCashItem(row.direction);
  const cashItem = !row.cashItem || row.cashItem === prevCashItem
    ? defaultCashItem(next)
    : row.cashItem;
  return { ...row, direction: next, amount, directionSource: 'manual', settlementsKind, cashItem };
}

export default function BankStatementImport() {
  const { isDebugMode } = useDebug();
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<BankStatementRow[]>([]);
  const [filter, setFilter] = useState<BankStatementDirection>('expense');
  const [fileCashAccount, setFileCashAccount] = useState<string | null>(null);
  const [firm, setFirm] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<BankStatementParseMapping>(DEFAULT_BANK_STATEMENT_MAPPING);
  const [templates, setTemplates] = useState<BankStatementTemplate[]>([DEFAULT_BANK_STATEMENT_TEMPLATE]);
  const [activeTemplateId, setActiveTemplateId] = useState(DEFAULT_BANK_STATEMENT_TEMPLATE.id);
  const [excelRowCount, setExcelRowCount] = useState<number | undefined>();
  const [skippedCount, setSkippedCount] = useState<number | undefined>();
  const [rawSample, setRawSample] = useState<BankStatementRawSampleRow[] | undefined>();
  const [exportResult, setExportResult] = useState<{
    exported: number;
    cashOutCount: number;
    cashInCount: number;
    errors: Array<{ rowIndex: number; operationNumber: string; error: string }>;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [payloadData, setPayloadData] = useState<any | null>(null);
  const [payloadIds, setPayloadIds] = useState<string[]>([]);
  const [kindKeywords, setKindKeywords] = useState<Record<string, string[]>>({});
  const [inlineEditColumns, setInlineEditColumns] = useState<BankStatementInlineColumn[]>([]);

  const parseFile = useCallback(async (file: File, nextMapping: BankStatementParseMapping) => {
    setIsParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(nextMapping));

      const res = await fetch('/api/dilovod/bank-statement/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Помилка сервера' }));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }

      const data: BankStatementPreviewResponse = await res.json();
      const mapped = applySettlementsKindKeywords(
        data.rows ?? [],
        kindKeywords,
        defaultSettlementsKind,
      );
      setRows(mapped);
      setPayloadIds(
        (data.rows ?? [])
          .filter((r) => r.direction === 'expense')
          .map((r) => String(r.rowIndex)),
      );
      setFileCashAccount(data.fileCashAccount ?? null);
      setFirm(null);
      setFilter('expense');
      setExcelRowCount(data.excelRowCount);
      setSkippedCount(data.skippedCount);
      setRawSample(data.rawSample);
      if (data.mapping) setMapping(data.mapping);
      setStep('preview');

      (async () => {
        try {
          const confirmed: BankStatementConfirmedRow[] = mapped
            .filter((r) => r.amount > 0)
            .map(toBankStatementConfirmed);
          if (confirmed.length === 0) return;

          const res2 = await fetch('/api/dilovod/bank-statement/export?dryRun=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ rows: confirmed, fileCashAccount: data.fileCashAccount ?? null }),
          });
          if (!res2.ok) return;
          const dry = await res2.json().catch(() => null);
          const name = dry?.firmName ?? dry?.firm;
          if (name) setFirm(name);
        } catch {
          // auto-dry не критичний
        }
      })();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      ToastService.show({ title: 'Помилка парсингу', description: message, color: 'danger' });
    } finally {
      setIsParsing(false);
    }
  }, [kindKeywords]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dilovod/bank-statement/templates', { credentials: 'include' });
        if (!res.ok) return;
        const state = await res.json();
        if (cancelled) return;
        if (Array.isArray(state.templates) && state.templates.length > 0) {
          setTemplates(state.templates);
          const active = state.templates.find((t: BankStatementTemplate) => t.id === state.activeId)
            ?? state.templates[0];
          setActiveTemplateId(active.id);
          setMapping(active.mapping);
          if (state.kindKeywords && typeof state.kindKeywords === 'object') {
            setKindKeywords(state.kindKeywords);
          }
          if (Array.isArray(state.inlineEditColumns)) {
            setInlineEditColumns(state.inlineEditColumns);
          }
        }
      } catch {
        // лишаємо дефолт NovaPay
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    await parseFile(file, mapping);
  }, [parseFile, mapping]);

  const handleSelectTemplate = useCallback(async (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setActiveTemplateId(id);
    setMapping(tpl.mapping);
    fetch('/api/dilovod/bank-statement/templates/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
    if (selectedFile) await parseFile(selectedFile, tpl.mapping);
  }, [templates, selectedFile, parseFile]);

  const persistExtras = useCallback(async (partial: {
    kindKeywords?: Record<string, string[]>;
    inlineEditColumns?: BankStatementInlineColumn[];
  }) => {
    await fetch('/api/dilovod/bank-statement/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(partial),
    }).catch(() => undefined);
  }, []);

  const handleKindKeywordsChange = useCallback((dict: Record<string, string[]>) => {
    setKindKeywords(dict);
    setRows((prev) => applySettlementsKindKeywords(prev, dict, defaultSettlementsKind, { onlyDefault: true }));
    void persistExtras({ kindKeywords: dict });
  }, [persistExtras]);

  const handleInlineEditColumnsChange = useCallback((columns: BankStatementInlineColumn[]) => {
    setInlineEditColumns(columns);
    void persistExtras({ inlineEditColumns: columns });
  }, [persistExtras]);

  const persistTemplate = useCallback(async (template: BankStatementTemplate) => {
    const res = await fetch('/api/dilovod/bank-statement/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ template }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Помилка збереження' }));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    const state = await res.json();
    setTemplates(state.templates);
    setActiveTemplateId(state.activeId);
    const active = state.templates.find((t: BankStatementTemplate) => t.id === state.activeId);
    if (active) setMapping(active.mapping);
    ToastService.show({ title: 'Шаблон збережено', description: template.name, color: 'success' });
  }, []);

  const handleSaveTemplate = useCallback(async (name: string) => {
    try {
      await persistTemplate({
        id: `tpl-${Date.now()}`,
        name,
        mapping,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      ToastService.show({ title: 'Не вдалося зберегти шаблон', description: message, color: 'danger' });
    }
  }, [mapping, persistTemplate]);

  const handleUpdateTemplate = useCallback(async () => {
    const current = templates.find((t) => t.id === activeTemplateId);
    if (!current) return;
    try {
      await persistTemplate({ ...current, mapping });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      ToastService.show({ title: 'Не вдалося оновити шаблон', description: message, color: 'danger' });
    }
  }, [templates, activeTemplateId, mapping, persistTemplate]);

  const handleDeleteTemplate = useCallback(async () => {
    const current = templates.find((t) => t.id === activeTemplateId);
    if (!current || current.builtIn) return;
    try {
      const res = await fetch(`/api/dilovod/bank-statement/templates/${encodeURIComponent(current.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Помилка видалення' }));
        throw new Error(err.message);
      }
      const state = await res.json();
      setTemplates(state.templates);
      setActiveTemplateId(state.activeId);
      const active = state.templates.find((t: BankStatementTemplate) => t.id === state.activeId);
      if (active) {
        setMapping(active.mapping);
        if (selectedFile) await parseFile(selectedFile, active.mapping);
      }
      ToastService.show({ title: 'Шаблон видалено', color: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      ToastService.show({ title: 'Не вдалося видалити', description: message, color: 'danger' });
    }
  }, [templates, activeTemplateId, selectedFile, parseFile]);

  const handleToggleDirection = useCallback((rowIndexes: number[]) => {
    const set = new Set(rowIndexes);
    setRows((prev) => prev.map((r) => (set.has(r.rowIndex) ? toggleRowDirection(r) : r)));
  }, []);

  const handleDeleteRows = useCallback((rowIndexes: number[]) => {
    const set = new Set(rowIndexes);
    setRows((prev) => prev.filter((r) => !set.has(r.rowIndex)));
    setPayloadIds((prev) => prev.filter((id) => !set.has(Number(id))));
  }, []);

  const handleUpdateRow = useCallback((rowIndex: number, patch: Partial<BankStatementRow>) => {
    setRows((prev) => {
      const current = prev.find((r) => r.rowIndex === rowIndex);
      const nextRows = prev.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r));
      if (
        current
        && patch.settlementsKind
        && patch.settlementsKind !== current.settlementsKind
      ) {
        const learned = learnUniqueKeywords(
          (patch.purpose ?? current.purpose),
          prev.filter((r) => r.rowIndex !== rowIndex).map((r) => r.purpose),
        );
        if (learned.length > 0) {
          const dict = addKeywordsToDict(kindKeywords, patch.settlementsKind, learned);
          setKindKeywords(dict);
          void persistExtras({ kindKeywords: dict });
          return applySettlementsKindKeywords(nextRows, dict, defaultSettlementsKind, { onlyDefault: true });
        }
      }
      return nextRows;
    });
  }, [kindKeywords, persistExtras]);

  const handleExport = useCallback(async (confirmedRows: BankStatementConfirmedRow[]) => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/dilovod/bank-statement/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rows: confirmedRows, fileCashAccount }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Помилка сервера' }));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setExportResult({
        exported: data.exportedCount,
        cashOutCount: data.cashOutCount ?? 0,
        cashInCount: data.cashInCount ?? 0,
        errors: data.errors ?? [],
      });
      setStep('done');

      if (data.exportedCount > 0) {
        ToastService.show({
          title: 'Успіх',
          description: `Відправлено ${data.exportedCount} документів в Діловод`,
          color: 'success',
        });
      }
      if (data.errors?.length > 0) {
        ToastService.show({
          title: 'Увага',
          description: `${data.errors.length} рядків не вдалося відправити`,
          color: 'warning',
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      ToastService.show({ title: 'Помилка відправки', description: message, color: 'danger' });
    } finally {
      setIsExporting(false);
    }
  }, [fileCashAccount]);

  const handleShowPayload = useCallback(async (confirmedRows: BankStatementConfirmedRow[]) => {
    try {
      const res = await fetch('/api/dilovod/bank-statement/export?dryRun=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rows: confirmedRows, fileCashAccount }),
      });
      const data = await res.json();
      const name = data?.firmName ?? data?.firm;
      if (name) setFirm(name);
      setPayloadData(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      ToastService.show({ title: 'Помилка payload', description: message, color: 'danger' });
    }
  }, [fileCashAccount]);

  const handleReset = useCallback(() => {
    setRows([]);
    setPayloadIds([]);
    setExportResult(null);
    setFilter('expense');
    setSelectedFile(null);
    setExcelRowCount(undefined);
    setSkippedCount(undefined);
    setRawSample(undefined);
    setStep('upload');
  }, []);

  const payloadRows = useMemo(() => {
    const set = new Set(payloadIds);
    return rows.filter((r) => set.has(String(r.rowIndex)));
  }, [rows, payloadIds]);

  return (
    <div className="container bg-white rounded-lg p-6">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm text-gray-500 mt-1 lg:leading-relaxed">
            Завантажте Excel-файл банківської виписки. Операції з дебету стануть «Видаток грошей»,
            з кредиту — «Надходження грошей» (окремі документи без привʼязки до замовлень).
          </p>
        </div>

        <Timeline steps={TIMELINE_STEPS} currentKey={step} color="sky" mobile={{ iconSize: 20, iconPadding: 10, connectorMinWidth: 60, connectorMaxWidth: 120 }} fontSize={14} gap={10} />

        <ParseSettingsPanel
          mapping={mapping}
          onMappingChange={setMapping}
          templates={templates}
          activeTemplateId={activeTemplateId}
          onSelectTemplate={handleSelectTemplate}
          onReparse={() => { if (selectedFile) void parseFile(selectedFile, mapping); }}
          onSaveTemplate={(name) => { void handleSaveTemplate(name); }}
          onUpdateTemplate={() => { void handleUpdateTemplate(); }}
          onDeleteTemplate={() => { void handleDeleteTemplate(); }}
          isParsing={isParsing}
          canReparse={Boolean(selectedFile)}
          excelRowCount={excelRowCount}
          skippedCount={skippedCount}
          parsedCount={rows.length}
          rawSample={rawSample}
          showRawSample={isDebugMode || (step === 'preview' && rows.length === 0)}
          defaultExpanded={isDebugMode || (step === 'preview' && rows.length === 0)}
          kindKeywords={kindKeywords}
          onKindKeywordsChange={handleKindKeywordsChange}
          inlineEditColumns={inlineEditColumns}
          onInlineEditColumnsChange={handleInlineEditColumnsChange}
        />

        {step === 'upload' && (
          <FileUploadZone onFileSelect={handleFileSelect} isLoading={isParsing} />
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-5">
            <BankStatementPreviewTable
              rows={rows}
              filter={filter}
              onFilterChange={setFilter}
              onToggleDirection={handleToggleDirection}
              onDeleteRows={handleDeleteRows}
              onUpdateRow={handleUpdateRow}
              payloadIds={payloadIds}
              onPayloadIdsChange={setPayloadIds}
              inlineEditColumns={inlineEditColumns}
            />
            <BankStatementSummary
              rows={payloadRows}
              totalParsed={rows.length}
              isExporting={isExporting}
              onExport={handleExport}
              onShowPayload={handleShowPayload}
              onReset={handleReset}
              fileCashAccount={fileCashAccount ?? undefined}
              firm={firm ?? undefined}
            />
          </div>
        )}

        {step === 'done' && exportResult && (
          <div className="flex flex-col items-center gap-4 py-8 w-full">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${exportResult.errors.length > 0 ? 'bg-warning-100' : 'bg-success-100'}`}>
              {exportResult.errors.length > 0 ? (
                <DynamicIcon name="triangle-alert" size={36} className="text-warning-600" />
              ) : (
                <DynamicIcon name="circle-check" size={36} className="text-success-600" />
              )}
            </div>
            <p className="text-base font-medium text-gray-800">Імпорт завершено</p>
            <p className="text-sm text-gray-500">
              Відправлено: <b>{exportResult.exported}</b>
              {' '}(витрати {exportResult.cashOutCount}, надходження {exportResult.cashInCount})
              {exportResult.errors.length > 0 && (
                <> · <span className="text-warning-600">Помилок: {exportResult.errors.length}</span></>
              )}
            </p>

            {exportResult.errors.length > 0 && (
              <div className="mt-4 w-full max-w-2xl bg-white border border-warning-100 rounded p-4">
                <p className="text-sm font-medium text-warning-700 mb-2">Деталі помилок:</p>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {exportResult.errors.map((e) => (
                    <li key={`${e.rowIndex}-${e.operationNumber}`} className="mb-1">
                      <strong>Рядок {e.rowIndex}</strong> — №{e.operationNumber}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button variant="solid" color="primary" onPress={handleReset} startContent={<DynamicIcon name="rotate-ccw" size={15} />}>
              Новий імпорт
            </Button>
          </div>
        )}

        <PayloadPreviewModal
          isOpen={!!payloadData}
          onClose={() => setPayloadData(null)}
          payload={payloadData}
          title="Bank statement payload (dry-run)"
        />
      </div>
    </div>
  );
}
