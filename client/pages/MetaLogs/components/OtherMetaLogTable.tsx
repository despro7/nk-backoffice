import { useState } from 'react';
import { formatRelativeDate } from '@/lib/formatUtils';
import { Tooltip, Drawer, DrawerContent, DrawerHeader, DrawerBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import MetaLogJsonView from '@/components/MetaLogJsonView';
import type { MetaLogRow } from '@shared/types/metaLog';
import { formatInitiator } from '@/lib/metaLogsParser';
import { useMetaLogDetail } from '../hooks/useMetaLogDetail';

export default function OtherMetaLogTable({
  rows,
  title,
  isAdmin,
  onResolve,
  loading,
}: {
  rows: MetaLogRow[];
  title?: string;
  isAdmin?: boolean;
  onResolve?: (sourceIds: Array<number | string>) => Promise<void>;
  loading?: boolean;
}) {
  const [processingIds, setProcessingIds] = useState<Array<number | string>>([]);
  const [hiddenIds, setHiddenIds] = useState<Array<number | string>>([]);
  const { logOpen, logRow, logDetail, logLoading, openLogDrawer, closeLogDrawer, setLogOpen } = useMetaLogDetail();

  const getCombinedAttempts = (row: MetaLogRow) => {
    const map = new Map<string, { id: number | string; datetime: string; initiator?: MetaLogRow['initiator'] }>();
    if (Array.isArray(row.attemptsList)) {
      for (const a of row.attemptsList) map.set(String(a.id), a);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
    );
  };

  const renderAttemptsTooltip = (attemptsList: MetaLogRow['attemptsList']) => {
    if (!Array.isArray(attemptsList) || attemptsList.length === 0) return null;
    return (
      <div className="text-xs max-w-[320px]">
        {attemptsList
          .slice()
          .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
          .map((a) => (
            <div key={String(a.id)} className="py-0.5">
              {new Date(a.datetime).toLocaleString('uk-UA', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}{' '}
              – {formatInitiator(a.initiator as any)}
            </div>
          ))}
      </div>
    );
  };

  const getInitiatorDisplay = (row: MetaLogRow) => {
    const attempts = getCombinedAttempts(row);
    if (attempts.length > 0) {
      const last = attempts[attempts.length - 1];
      return formatInitiator(last.initiator as any);
    }
    return formatInitiator(row.initiator as any);
  };

  const getSubjectLabel = (row: MetaLogRow) => {
    if (row.productName) return row.productName;
    if (row.title && String(row.title).toLowerCase().includes('автофінал')) {
      return row.docNumber ? `Автофіналізація накладної №${row.docNumber}` : row.title;
    }
    return row.docNumber ? `Документ №${row.docNumber}` : (row.title ?? '—');
  };

  const getErrorLabel = (row: MetaLogRow) => {
    if (row.title) return row.title;
    const raw = String(row.rawMessage ?? row.dilovodResponse ?? '').replace(/<[^>]+>/g, '').trim();
    return raw || '—';
  };

  return (
    <div className="bg-white rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">{title || 'Інші помилки'}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b">
              <th className="px-3 py-2">Дата</th>
              <th className="px-3 py-2">Помилка</th>
              <th className="px-3 py-2">Товар / документ</th>
              <th className="px-3 py-2">Артикул</th>
              <th className="px-3 py-2">Ініціатор</th>
              <th className="px-3 py-2">Спроб</th>
              <th className="px-3 py-2">Дії</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && loading ? (
              <tr>
                <td className="text-center px-3 pt-14 pb-10 text-gray-500" colSpan={7}>
                  <DynamicIcon name="loader" size={24} className="mx-auto mb-2 text-gray-400 animate-spin" />
                  Завантаження...
                </td>
              </tr>
            ) : (
              rows.length === 0 && (
                <tr>
                  <td className="text-center px-3 pt-14 pb-10 text-gray-500" colSpan={7}>
                    <DynamicIcon name="file-search" size={24} className="mx-auto mb-2 text-gray-400" />
                    Немає записів
                  </td>
                </tr>
              )
            )}

            {rows
              .filter((r) => !hiddenIds.includes(r.id))
              .map((r) => {
                const combinedAttempts = getCombinedAttempts(r);
                return (
                  <tr
                    key={r.id}
                    className={`border-b last:border-b-0 even:bg-gray-50 ${processingIds.includes(r.id) ? 'bg-yellow-200' : ''}`}
                  >
                    <td className="px-3 py-2 align-top">
                      <Tooltip content={new Date(r.createdAt).toLocaleString()}>
                        <span className="whitespace-nowrap">{formatRelativeDate(r.createdAt)}</span>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-danger-600">{getErrorLabel(r)}</div>
                      {r.rawMessage && r.title ? (
                        <div className="text-xs text-gray-500 mt-1 max-w-[360px] line-clamp-2">
                          {String(r.rawMessage).replace(/<[^>]+>/g, '').trim()}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top">{getSubjectLabel(r)}</td>
                    <td className="px-3 py-2 align-top">{r.sku ?? '—'}</td>
                    <td className="px-3 py-2 align-top">{getInitiatorDisplay(r)}</td>
                    <td className="px-3 py-2 align-top">
                      {combinedAttempts.length > 1 ? (
                        <Tooltip content={renderAttemptsTooltip(combinedAttempts)}>
                          <span className="underline cursor-help">{combinedAttempts.length}</span>
                        </Tooltip>
                      ) : (
                        <span>{r.attempts ?? r.occurrenceCount ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        {isAdmin && onResolve ? (
                          <>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                setProcessingIds((prev) => [...prev, r.id]);
                                try {
                                  const ids = r.sourceIds && r.sourceIds.length > 0 ? r.sourceIds : [r.id];
                                  await onResolve(ids);
                                  setHiddenIds((prev) => [...prev, r.id]);
                                } catch {
                                  // parent shows toast
                                } finally {
                                  setProcessingIds((prev) => prev.filter((x) => x !== r.id));
                                }
                              }}
                              title="Вирішено — сховати для всіх"
                              className="flex items-center gap-1 text-[11px] text-success-600 bg-success-50 hover:bg-success-100 px-2 py-0.5 rounded-full transition-colors border border-success-200"
                            >
                              <DynamicIcon name="check-check" size={12} />
                              Вирішено
                            </button>
                            <span className="text-gray-300">|</span>
                          </>
                        ) : null}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openLogDrawer(r);
                          }}
                          title="Переглянути лог"
                          className="flex items-center gap-1 text-[11px] text-primary-700 bg-primary-50 hover:bg-primary-100 px-2 py-0.5 rounded-full transition-colors border border-primary-200"
                        >
                          Log
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={logOpen} onOpenChange={(open) => { if (!open) closeLogDrawer(); }} placement="bottom" size="lg">
        <DrawerContent>
          {() => (
            <>
              <DrawerHeader>
                Повний лог події {logRow ? (logRow.sku ? `SKU: ${logRow.sku}` : `id:${logRow.id}`) : ''}
              </DrawerHeader>
              <DrawerBody className="overflow-y-auto p-4">
                {logRow ? (
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-sm text-gray-700">Лог події — підсумок</div>
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(JSON.stringify(logDetail ?? logRow, null, 2));
                          } catch {
                            // ignore
                          }
                        }}
                        className="text-sm px-3 py-1 rounded border bg-white hover:bg-gray-50"
                      >
                        Копіювати
                      </button>
                    </div>

                    <div className="mb-3 text-sm space-y-1">
                      <div><strong>Помилка:</strong> {logRow.title ?? '—'}</div>
                      <div><strong>Товар:</strong> {logRow.productName ?? '—'}</div>
                      <div><strong>Артикул:</strong> {logRow.sku ?? '—'}</div>
                      <div><strong>Створено:</strong> {logRow.createdAt ? new Date(logRow.createdAt).toLocaleString('uk-UA') : '—'}</div>
                      <div><strong>Ініціатор:</strong> {getInitiatorDisplay(logRow)}</div>
                    </div>

                    <div className="mb-3">
                      <strong className="text-sm">Спроби:</strong>
                      <div className="mt-2 text-xs">
                        {getCombinedAttempts(logRow).map((a) => (
                          <div key={String(a.id)} className="py-0.5">
                            {new Date(a.datetime).toLocaleString('uk-UA')} – {formatInitiator(a.initiator as any)}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <strong className="text-sm">Дані логу:</strong>
                      {logLoading ? (
                        <div className="mt-2 text-sm text-gray-500 flex items-center gap-2">
                          <DynamicIcon name="loader" size={16} className="animate-spin" />
                          Завантаження...
                        </div>
                      ) : (
                        <MetaLogJsonView
                          value={logDetail ?? logRow}
                          className="mt-2 max-h-[50vh]"
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500">Немає даних</div>
                )}
              </DrawerBody>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
