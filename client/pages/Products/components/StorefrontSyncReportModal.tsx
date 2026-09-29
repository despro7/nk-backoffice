import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from '@heroui/react';
import { useDraggable } from '@heroui/use-draggable';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { StorefrontBulkSyncReport, WooStockSyncResult } from '@shared/types/storefront';

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s} сек.`;
  return `${m} хв ${s} сек.`;
}

function StepRow({
  ok,
  warn,
  label,
  detail,
}: {
  ok: boolean;
  warn?: boolean;
  label: React.ReactNode;
  detail: string;
}) {
  const icon = !ok ? 'circle-x' : warn ? 'triangle-alert' : 'circle-check';
  const color = !ok ? 'text-danger' : warn ? 'text-warning-600' : 'text-success';
  return (
    <div className="flex items-start gap-2.5 py-2">
      <DynamicIcon name={icon} size={15} className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{label}</p>
        {detail ? <p className="mt-0.5 text-xs leading-snug text-default-500">{detail}</p> : null}
      </div>
    </div>
  );
}

function ErrorList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-danger-600">
      {items.map((err, i) => (
        <li key={`${i}-${err.slice(0, 40)}`}>{err}</li>
      ))}
    </ul>
  );
}

type ResultFilter = 'all' | 'ok' | 'failed' | 'skipped';

interface StorefrontSyncReportModalProps {
  report: StorefrontBulkSyncReport | null;
  onClose: () => void;
}

export function StorefrontSyncReportModal({ report, onClose }: StorefrontSyncReportModalProps) {
  const [filter, setFilter] = useState<ResultFilter>('all');
  const modalTargetRef = useRef<HTMLElement>(null);
  const { moveProps } = useDraggable({
    targetRef: modalTargetRef,
    isDisabled: !report,
  });

  useEffect(() => {
    if (report) return;
    if (modalTargetRef.current) {
      modalTargetRef.current.style.transform = '';
    }
  }, [report]);

  const filteredRows = useMemo(() => {
    if (!report) return [];
    switch (filter) {
      case 'ok':
        return report.results.filter((row) => row.ok && !row.action?.includes('skip'));
      case 'failed':
        return report.results.filter((row) => !row.ok);
      case 'skipped':
        return report.results.filter((row) => row.action === 'skip');
      default:
        return report.results;
    }
  }, [report, filter]);

  if (!report) return null;

  const hasWarnings = report.results.some((row) => (row.warnings?.length ?? 0) > 0);
  const tone =
    report.summary.failed > 0 ? 'danger' : report.summary.skipped > 0 || hasWarnings ? 'warning' : 'success';
  const icon = tone === 'danger' ? 'circle-x' : tone === 'warning' ? 'triangle-alert' : 'circle-check';
  const title =
    report.op === 'stock'
      ? report.summary.failed > 0
        ? 'Оновлення залишків на сайті завершено з помилками'
        : 'Оновлення залишків на сайті завершено'
      : report.op === 'push'
        ? report.summary.failed > 0
          ? 'Push на сайт завершено з помилками'
          : 'Push на сайт завершено'
        : report.summary.failed > 0
          ? 'Pull з сайту завершено з помилками'
          : 'Pull з сайту завершено';

  const errorMessages = report.results
    .filter((row) => row.error)
    .map((row) => `${row.sku || row.goodId}: ${row.error}`);

  return (
    <Modal
      ref={modalTargetRef}
      isOpen
      onClose={onClose}
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        base: 'max-w-2xl rounded-xl shadow-lg',
        header: 'px-4 pb-1 pt-4 pr-10',
        body: 'px-4 py-1',
        footer: 'px-4 pt-2 pb-3 justify-end',
        closeButton: 'absolute right-2.5 top-2.5',
      }}
    >
      <ModalContent>
        <ModalHeader
          {...moveProps}
          className="flex cursor-move touch-none select-none items-center gap-2 text-base font-semibold"
        >
          <DynamicIcon
            name={icon}
            size={18}
            className={
              tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning-600' : 'text-danger'
            }
          />
          <span className="min-w-0 flex-1 truncate">
            {title} за {formatDuration(report.durationMs)}
          </span>
        </ModalHeader>
        <ModalBody>
          <StepRow
            ok={report.summary.failed === 0}
            warn={report.summary.failed > 0 && report.summary.ok > 0}
            label="Підсумок"
            detail={`Всього ${report.summary.total} · OK ${report.summary.ok} · Помилок ${report.summary.failed} · Пропущено ${report.summary.skipped} · Створено ${report.summary.created}`}
          />

          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Деталі по SKU</p>
            <Select
              size="sm"
              className="w-40"
              aria-label="Фільтр результатів"
              selectedKeys={[filter]}
              onChange={(e) => setFilter((e.target.value as ResultFilter) || 'all')}
            >
              <SelectItem key="all">Усі</SelectItem>
              <SelectItem key="ok">Успішні</SelectItem>
              <SelectItem key="failed">Помилки</SelectItem>
              <SelectItem key="skipped">Пропущені</SelectItem>
            </Select>
          </div>

          <div className="max-h-64 overflow-auto rounded-sm border border-default-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-content1 text-default-500 z-10">
                <tr>
                  <th className="px-2 py-1.5 font-medium">SKU</th>
                  <th className="px-2 py-1.5 font-medium">Назва</th>
                  <th className="px-2 py-1.5 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.goodId} className="border-t border-default-100">
                    <td className="px-2 py-1.5 font-mono">{row.sku || '—'}</td>
                    <td className="px-2 py-1.5">{row.name}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {!row.ok ? (
                          <Chip size="sm" color="danger" variant="flat">Помилка</Chip>
                        ) : row.action === 'skip' ? (
                          <Chip size="sm" color="default" variant="flat">Пропущено</Chip>
                        ) : (
                          <Chip size="sm" color="success" variant="flat">OK</Chip>
                        )}
                        {row.created ? (
                          <Chip size="sm" color="primary" variant="flat">Створено</Chip>
                        ) : null}
                        {row.appliedFields?.length ? (
                          <span className="text-default-500">{row.appliedFields.length} полів</span>
                        ) : null}
                      </div>
                      {row.error ? <p className="mt-0.5 text-danger-600">{row.error}</p> : null}
                      {row.warnings?.length ? (
                        <p className="mt-0.5 text-warning-600">{row.warnings.join('; ')}</p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ErrorList items={errorMessages} />
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="flat" onPress={onClose}>
            Закрити
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function buildStorefrontStockReport(
  durationMs: number,
  result: WooStockSyncResult,
  nameBySku: Map<string, string>,
): StorefrontBulkSyncReport {
  const results: StorefrontBulkSyncReport['results'] = result.results.map((row) => ({
    goodId: row.goodId || row.sku,
    sku: row.sku,
    name: nameBySku.get(row.sku) || row.sku,
    ok: row.ok,
    action: row.skipped ? 'skip' : undefined,
    error: row.error,
    warnings:
      row.effectiveStock != null && row.ok && !row.skipped
        ? [`Залишок: ${row.effectiveStock}`]
        : undefined,
  }));
  return buildStorefrontBulkReport('stock', durationMs, results);
}

export function buildStorefrontBulkReport(
  op: 'push' | 'pull' | 'stock',
  durationMs: number,
  results: StorefrontBulkSyncReport['results'],
): StorefrontBulkSyncReport {
  const skipped = results.filter((row) => row.action === 'skip').length;
  const failed = results.filter((row) => !row.ok).length;
  const created = results.filter((row) => row.created).length;
  const ok = results.filter((row) => row.ok && row.action !== 'skip').length;
  return {
    op,
    durationMs,
    summary: {
      total: results.length,
      ok,
      failed,
      skipped,
      created,
    },
    results,
  };
}
