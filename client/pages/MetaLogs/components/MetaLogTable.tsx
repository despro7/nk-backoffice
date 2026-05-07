import { useState } from 'react';
import { formatRelativeDate } from "@/lib/formatUtils";
import { Tooltip, Drawer, DrawerContent, DrawerHeader, DrawerBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import SalesDriveOrdersTable from '../../../components/SalesDriveOrdersTable';
import type { MetaLogRow } from '@shared/types/metaLog';

export default function MetaLogTable({ rows, title, hideOrderNumber = false, isAdmin, onResolve, loading, simple = false }: { rows: MetaLogRow[]; title?: string; hideOrderNumber?: boolean; isAdmin?: boolean; onResolve?: (sourceIds: Array<number | string>) => Promise<void>; loading?: boolean; simple?: boolean }) {
  const fmt = (v: number | null | undefined) => {
    if (v === null || v === undefined) return '—';
    if (Number.isFinite(v)) return (Math.round(v) === v ? String(v) : String(v));
    return String(v);
  };

  const renderInitiator = (initiator: MetaLogRow['initiator']) => {
    if (!initiator) return <span>system</span>;
    const raw = typeof initiator === 'object' ? (initiator.name ?? (initiator as any).raw ?? JSON.stringify(initiator)) : String(initiator);
    // split tokens by comma/semicolon/pipe only — keep multi-word names intact
    const parts = raw.split(/[,;|]\s*/).map(p => p.trim()).filter(Boolean);
    const emojis = new Set<string>();
    const textParts = new Set<string>();
    for (const p of parts) {
      const low = p.toLowerCase();
      if (/(manual|user|human|person)/.test(low)) { emojis.add('👤'); continue; }
      if (/(webhook|bot|robot|auto|system|cron)/.test(low)) { emojis.add('🤖'); continue; }
      // keep meaningful tokens like status_change
      textParts.add(p);
    }
    const emojiStr = Array.from(emojis).join(' ');
    const textStr = Array.from(textParts).join(', ');
    const label = [emojiStr, textStr].filter(Boolean).join(' | ');
    return (
      <span className="flex items-center gap-2"><span className="text-sm">{label}</span></span>
    );
  };
  const getMessageText = (r: MetaLogRow) => {
    const raw = (r.rawMessage ?? (r as any).message ?? (r.data && ((r.data.error as string) ?? (r.data.dilovodResponse && (r.data.dilovodResponse.error as string))))) ?? '';
    // strip simple HTML tags for plain display
    return String(raw).replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' ').trim();
  };

  const parseSkuFromMessage = (msg: string) => {
    if (!msg) return undefined;
    const m = msg.match(/Артикул[:\s]*([^|,;\s]+)/i) || msg.match(/арт\.?[:\s]*([^|,;\s]+)/i);
    return m ? m[1] : undefined;
  };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerOrder, setDrawerOrder] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Array<number | string>>([]);
  const [hiddenIds, setHiddenIds] = useState<Array<number | string>>([]);

  const openOrderDrawer = (orderNumber?: string | null) => {
    if (!orderNumber) return;
    setDrawerOrder(orderNumber);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerOrder(null);
  };
  return (
    <div className="bg-white rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">{title || 'Meta Logs'}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b">
              {simple ? (
                <>
                  <th className="px-3 py-2">Дата</th>
                  <th className="px-3 py-2">Помилка</th>
                  <th className="px-3 py-2">Назва документу</th>
                  <th className="px-3 py-2">Автор</th>
                  <th className="px-3 py-2">Ініціатор</th>
                  <th className="px-3 py-2">Спроб</th>
                  <th className="px-3 py-2">Дії</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2">Дата</th>
                  {!hideOrderNumber && <th className="px-3 py-2">Номер замовлення</th>}
                  <th className="px-3 py-2">Помилка</th>
                  <th className="px-3 py-2">Назва документу</th>
                  <th className="px-3 py-2">Артикул</th>
                  <th className="px-3 py-2">Потрібно</th>
                  <th className="px-3 py-2">Залишок</th>
                  <th className="px-3 py-2">Бракує</th>
                  <th className="px-3 py-2">Ініціатор</th>
                  <th className="px-3 py-2">Спроб</th>
                  <th className="px-3 py-2">Дії</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && loading ? (
              <tr>
                <td className="text-center px-3 pt-14 pb-10 text-gray-500" colSpan={simple ? 7 : (hideOrderNumber ? 10 : 11)}>
									<DynamicIcon name="loader" size={24} className="mx-auto mb-2 text-gray-400 animate-spin" />
                  Завантаження...
                </td>
              </tr>
            ) : (
              rows.length === 0 && (
                <tr>
                  <td className="text-center px-3 pt-14 pb-10 text-gray-500" colSpan={simple ? 7 : (hideOrderNumber ? 10 : 11)}>
                    <DynamicIcon name="file-search" size={24} className="mx-auto mb-2 text-gray-400" />
                    Немає записів
                  </td>
                </tr>
              )
						)}

            {rows.filter(r => !hiddenIds.includes(r.id)).map((r) => (
              <tr key={r.id} className={`border-b last:border-b-0 even:bg-gray-50 ${processingIds.includes(r.id) ? 'bg-yellow-200' : ''}`}>
                <td className="px-3 py-2 align-top">
                  <Tooltip content={new Date(r.createdAt).toLocaleString()}>
                    <span className="whitespace-nowrap">{formatRelativeDate(r.createdAt)}</span>
                  </Tooltip>
                </td>
                {simple ? (
                  <>
                    <td className="px-3 py-2 align-top">{r.dilovodResponse ?? r.rawMessage ?? r.productName ?? '—'}</td>
                    <td className="px-3 py-2 align-top">{
                      (r.title && String(r.title).toLowerCase().includes('автофінал'))
                        ? (r.docNumber ? `Автофіналізація накладної №${r.docNumber}` : (r.title ?? r.productName ?? '—'))
                        : (r.title ?? r.productName ?? '—')
                    }</td>
                    <td className="px-3 py-2 align-top">{r.author ?? '—'}</td>
                    <td className="px-3 py-2 align-top">{renderInitiator(r.initiator)}</td>
                    <td className="px-3 py-2 align-top">{r.attempts ?? r.occurrenceCount ?? '—'}</td>
                    <td className="px-3 py-2 align-top">
                      {isAdmin && onResolve ? (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setProcessingIds(prev => [...prev, r.id]);
                            try {
                              const ids = r.sourceIds && r.sourceIds.length > 0 ? r.sourceIds : [r.id];
                              await onResolve(ids);
                              setHiddenIds(prev => [...prev, r.id]);
                            } catch (err) {
                            } finally {
                              setProcessingIds(prev => prev.filter(x => x !== r.id));
                            }
                          }}
                          title="Вирішено — сховати для всіх"
                          className="flex items-center gap-1 text-[11px] text-success-600 bg-success-50 hover:bg-success-100 px-2 py-0.5 rounded-full transition-colors border border-success-200"
                        >
                          <DynamicIcon name="check-check" size={12} />
                          Вирішено
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    {!hideOrderNumber && (
                      <td className="px-3 py-2 align-top">
                        {r.orderNumber ? (
                          <button onClick={() => openOrderDrawer(r.orderNumber)} className="text-primary-600 underline">
                            {r.orderNumber}
                          </button>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    )}
                    {/* For document-save logs: show full message in 'Помилка' column, and derive document name and sku from message/data */}
                    <td className="px-3 py-2 align-top">{getMessageText(r) || '—'}</td>
                    <td className="px-3 py-2 align-top">{
                      // detect 'переміщення' in message -> show Накладна переміщення №{internalDocNumber}
                      (() => {
                        const msg = getMessageText(r).toLowerCase();
                        if (/переміщен/i.test(msg)) {
                          const internal = r.data && (r.data.internalDocNumber ?? r.data.draftId ?? r.data.docNumber);
                          return internal ? `Накладна переміщення №${internal}` : (r.title ?? '—');
                        }
                        return r.productName ?? r.title ?? '—';
                      })()
                    }</td>
                    <td className="px-3 py-2 align-top">{parseSkuFromMessage(getMessageText(r)) ?? r.sku ?? '—'}</td>
                    <td className="px-3 py-2 align-top">{fmt(r.needed)}</td>
                    <td className="px-3 py-2 align-top">{fmt(r.stock)}</td>
                    <td className="px-3 py-2 align-top text-red-600 font-medium">{r.missing == null ? '—' : (r.missing === 0 ? '—' : String(r.missing))}</td>
                    <td className="px-3 py-2 align-top">{renderInitiator(r.initiator)}</td>
                    <td className="px-3 py-2 align-top">
                      {Array.isArray(r.attemptsList) && r.attemptsList.length > 1 ? (
                        <Tooltip
                          content={<div className="text-xs max-w-[320px]">{r.attemptsList.slice().sort((a,b)=> new Date(a.datetime).getTime() - new Date(b.datetime).getTime()).map(a => (
                                <div key={String(a.id)} className="py-0.5">{new Date(a.datetime).toLocaleString()} – {typeof a.initiator === 'string' ? a.initiator : (a.initiator && (a.initiator as any).name) ?? (a.initiator && (a.initiator as any).raw) ?? '—'}</div>
                              ))}</div>}
                        >
                          <span className="underline cursor-help">{r.attemptsList.length}</span>
                        </Tooltip>
                      ) : (
                        <span>{r.attempts ?? r.occurrenceCount ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isAdmin && onResolve ? (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            // start processing UI
                            setProcessingIds(prev => [...prev, r.id]);
                            try {
                              const ids = r.sourceIds && r.sourceIds.length > 0 ? r.sourceIds : [r.id];
                              await onResolve(ids);
                              // hide all duplicates (optimistic)
                              setHiddenIds(prev => [...prev, r.id]);
                            } catch (err) {
                              // ignore, parent shows toast
                            } finally {
                              setProcessingIds(prev => prev.filter(x => x !== r.id));
                            }
                          }}
                          title="Вирішено — сховати для всіх"
                          className="flex items-center gap-1 text-[11px] text-success-600 bg-success-50 hover:bg-success-100 px-2 py-0.5 rounded-full transition-colors border border-success-200"
                        >
                          <DynamicIcon name="check-check" size={12} />
                          Вирішено
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Drawer isOpen={drawerOpen} onOpenChange={(open) => { if (!open) closeDrawer(); }} placement="bottom" size="sm">
        <DrawerContent>
          {(onClose) => (
            <>
              <DrawerHeader>Пошук замовлення {drawerOrder ? `#${drawerOrder}` : ''}</DrawerHeader>
              <DrawerBody className="overflow-y-auto p-4">
                {drawerOrder ? <SalesDriveOrdersTable className="w-full" initialSearch={String(drawerOrder)} hideFilters={true} /> : null}
              </DrawerBody>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
