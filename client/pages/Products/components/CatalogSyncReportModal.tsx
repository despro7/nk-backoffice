import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogSyncOp } from './CatalogSyncOverlay';

export type BranchSyncReportData = {
  upserted: number;
  orphansResolved: number;
  capped: boolean;
  legacySkuCount?: number;
  legacyOutdatedCount?: number;
  legacyError?: string | null;
  legacySync?: {
    success?: boolean;
    message?: string;
    createdProducts?: number;
    updatedProducts?: number;
    skippedProducts?: number;
    syncedSets?: number;
    errors?: string[];
  } | null;
};

export type StockSyncReportData = {
  success?: boolean;
  error?: string;
  stockUpdated?: number;
  stockMessage?: string;
  exported?: boolean;
  exportedCount?: number;
  adjustedCount?: number;
  wpTriggered?: boolean;
  wpStatus?: number | null;
  errors?: string[];
  alreadyRunning?: boolean;
};

export type CatalogSyncReport = {
  op: CatalogSyncOp;
  ok: boolean;
  folderName?: string;
  error?: string;
  durationSec: number;
  branch?: BranchSyncReportData;
  stock?: StockSyncReportData;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s} сек.`;
  return `${m} хв ${s} сек.`;
}

function joinParts(parts: Array<string | null | false | undefined>): string {
  return parts.filter(Boolean).join(' · ');
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

interface CatalogSyncReportModalProps {
  report: CatalogSyncReport | null;
  onClose: () => void;
}

export function CatalogSyncReportModal({ report, onClose }: CatalogSyncReportModalProps) {
  if (!report) return null;

  const warning =
    report.ok &&
    (report.op === 'branch'
      ? Boolean(
          report.branch?.capped ||
            report.branch?.legacyError ||
            (report.branch?.legacySync?.errors?.length ?? 0) > 0
        )
      : Boolean(
          (report.stock?.errors?.length ?? 0) > 0 ||
            !report.stock?.exported ||
            !report.stock?.wpTriggered
        ));

  const tone = !report.ok ? 'danger' : warning ? 'warning' : 'success';
  const icon = !report.ok ? 'circle-x' : warning ? 'triangle-alert' : 'circle-check';
  const title =
    report.op === 'branch'
      ? report.ok
        ? 'Гілку синхронізовано'
        : 'Синхронізація гілки не вдалась'
      : report.ok
        ? 'Залишки оновлено'
        : 'Оновлення залишків не вдалось';

  const branchErrors = [
    ...(report.branch?.legacyError ? [report.branch.legacyError] : []),
    ...(report.branch?.legacySync?.errors ?? []),
    ...(report.error && !report.ok ? [report.error] : []),
  ];
  const stockErrors = [
    ...(report.stock?.error && !report.ok ? [report.stock.error] : []),
    ...(report.stock?.errors ?? []),
    ...(report.error && !report.ok ? [report.error] : []),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const stock = report.stock;
  const wpOk = Boolean(stock?.wpTriggered);
  const wpWarn = Boolean(stock?.exported) && !wpOk;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      classNames={{
        base: 'max-w-sm rounded-xl shadow-lg',
        header: 'px-4 pb-1 pt-4 pr-10',
        body: 'px-4 py-1',
        footer: 'px-4 pt-2 pb-3 justify-end',
        closeButton: 'absolute right-2.5 top-2.5',
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-base font-semibold">
          <DynamicIcon
            name={icon}
            size={18}
            className={
              tone === 'success'
                ? 'text-success'
                : tone === 'warning'
                  ? 'text-warning-600'
                  : 'text-danger'
            }
          />
          <span className="min-w-0 flex-1 truncate">
            {title} за {formatDuration(report.durationSec)}
          </span>
        </ModalHeader>
        <ModalBody>
          {report.op === 'branch' && report.branch && (
            <div className="divide-y divide-default-100">
              {report.folderName ? (
                <p className="pb-2 text-xs text-default-500">
                  {report.folderName}
                </p>
              ) : null}
              <StepRow
                ok={report.ok}
                warn={report.branch.capped}
                label="Каталог Dilovod"
                detail={joinParts([
                  `${report.branch.upserted} записів`,
                  report.branch.orphansResolved
                    ? `сиріт ${report.branch.orphansResolved}`
                    : null,
                  report.branch.capped ? 'ліміт глибини' : null,
                ])}
              />
              <StepRow
                ok={!report.branch.legacyError}
                warn={Boolean(report.branch.legacyError || (report.branch.legacySync?.errors?.length ?? 0))}
                label="Legacy products"
                detail={joinParts([
                  report.branch.legacySkuCount ? `${report.branch.legacySkuCount} SKU` : null,
                  report.branch.legacySync?.createdProducts
                    ? `створено ${report.branch.legacySync.createdProducts}`
                    : null,
                  report.branch.legacySync?.updatedProducts
                    ? `оновлено ${report.branch.legacySync.updatedProducts}`
                    : null,
                  report.branch.legacySync?.skippedProducts
                    ? `без змін ${report.branch.legacySync.skippedProducts}`
                    : null,
                  report.branch.legacySync?.syncedSets
                    ? `комплектів ${report.branch.legacySync.syncedSets}`
                    : null,
                  report.branch.legacyOutdatedCount
                    ? `архів ${report.branch.legacyOutdatedCount}`
                    : null,
                ])}
              />
              <ErrorList items={branchErrors} />
            </div>
          )}

          {report.op === 'branch' && !report.branch && (
            <ErrorList items={report.error ? [report.error] : []} />
          )}

          {report.op === 'stock' && stock && (
            <div className="divide-y divide-default-100">
              <StepRow
                ok={!stock.alreadyRunning && stock.success !== false}
                warn={Boolean(stock.errors?.length) && Boolean(stock.exported)}
                label="Dilovod → Backoffice"
                detail={
                  stock.stockMessage ||
                  `${stock.stockUpdated ?? 0} оновлено`
                }
              />
              <StepRow
                ok={Boolean(stock.exported)}
                warn={!stock.exported}
                label="SalesDrive"
                detail={
                  stock.exported
                    ? joinParts([
                        `${stock.exportedCount ?? 0} товарів`,
                        stock.adjustedCount
                          ? `${stock.adjustedCount} коригувань`
                          : null,
                      ])
                    : 'не експортовано'
                }
              />
              <StepRow
                ok={wpOk}
                warn={wpWarn}
                label={
                  <>
                    WooCommerce{' '}
                    {wpOk ? (
                      <span className="text-gray-500 text-xs">
                        ({`HTTP ${stock.wpStatus ?? '—'}`})
                      </span>
                    ) : stock.exported ? (
                      <>
                        помилка
                        <span className="text-gray-500 text-xs">
                          {stock.wpStatus ? ` (HTTP ${stock.wpStatus})` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500 text-xs">(пропущено)</span>
                    )}
                  </>
                }
           
                detail={wpOk ? "Залишки на сайті оновлено" : undefined}
              />
              <ErrorList items={stockErrors} />
            </div>
          )}

          {report.op === 'stock' && !stock && (
            <ErrorList items={report.error ? [report.error] : []} />
          )}
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
