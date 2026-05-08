import { useState } from 'react';
import { formatRelativeDate } from "@/lib/formatUtils";
import { Tooltip, Drawer, DrawerContent, DrawerHeader, DrawerBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import SalesDriveOrdersTable from '../../../components/SalesDriveOrdersTable';
import type { MetaLogRow } from '@shared/types/metaLog';
import { parseShipmentMessage as parseShipmentMessageUtil, dedupeAndNormalize } from '@/lib/metaLogsParser';

export default function ShipmentMetaLogTable({ rows, title, isAdmin, onResolve, loading }: { rows: MetaLogRow[]; title?: string; isAdmin?: boolean; onResolve?: (sourceIds: Array<number | string>) => Promise<void>; loading?: boolean }) {
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

  // log drawer state for full event log
  const [logOpen, setLogOpen] = useState(false);
  const [logRow, setLogRow] = useState<MetaLogRow | null>(null);

  const openLogDrawer = (row: MetaLogRow) => {
    setLogRow(row);
    setLogOpen(true);
  };

  const closeLogDrawer = () => {
    setLogOpen(false);
    setLogRow(null);
  };

  const getCombinedAttempts = (row: MetaLogRow) => {
    const map = new Map<string, any>();
    if (Array.isArray(row.attemptsList)) {
      for (const a of row.attemptsList) map.set(String(a.id), a);
    }
    if (Array.isArray((row as any)._rows)) {
      for (const sub of (row as any)._rows) {
        if (Array.isArray(sub.attemptsList)) for (const a of sub.attemptsList) map.set(String(a.id), a);
      }
    }
    return Array.from(map.values()).sort((a,b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  };

  const fmt = (v: number | null | undefined) => {
    if (v === null || v === undefined) return '—';
    if (Number.isFinite(v)) return (Math.round(v) === v ? String(v) : String(v));
    return String(v);
  };

  const formatInitiator = (initiator: MetaLogRow['initiator'] | string | undefined) => {
    if (!initiator) return 'system';
    const raw = typeof initiator === 'string' ? initiator : (initiator as any).name ?? (initiator as any).raw ?? String(initiator);
    // split tokens and map webhook/manual to emojis
    const parts = String(raw).split(/[,;|]\s*/).map(p => p.trim()).filter(Boolean);
    let hasHumanName = false;
    const mapped = parts.map(p => {
      const low = p.toLowerCase();
      if (/(webhook|^webhook:)/.test(low)) return '🤖 Webhook';
      if (/^manual[:\-]?/i.test(low) || /\bmanual\b/i.test(low)) return '👤 WH Keeper';
      if (/\p{L}+\s+\p{L}+/u.test(p)) { hasHumanName = true; return `👤 ${p}`; }
      return p;
    });
    // if we have a named human, drop plain '👤 WH Keeper' tokens only when an actual name exists
    const filtered = mapped.filter(x => !(hasHumanName && x === '👤 WH Keeper'));
    const unique = Array.from(new Set(filtered));
    // prefer returning human names only when present
    const humanOnly = unique.filter(x => x.startsWith('👤'));
    if (humanOnly.length > 0) return humanOnly.join(', ');
    return unique.join(', ');
  };

  const renderAttemptsTooltip = (attemptsList: MetaLogRow['attemptsList']) => {
    if (!Array.isArray(attemptsList) || attemptsList.length === 0) return null;
    return (
      <div className="text-xs max-w-[320px]">
        {attemptsList.slice().sort((a,b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()).map(a => (
          <div key={String(a.id)} className="py-0.5">{new Date(a.datetime).toLocaleString('uk-UA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit', second:'2-digit' })} – {typeof a.initiator === 'string' ? formatInitiator(a.initiator) : ((a.initiator && (a.initiator as any).name) ?? (a.initiator && (a.initiator as any).raw) ?? '—')}</div>
        ))}
      </div>
    );
  };

  const getInitiatorDisplay = (row: MetaLogRow) => {
    const al = Array.isArray(row.attemptsList) && row.attemptsList.length > 0 ? row.attemptsList : undefined;
    if (al && al.length > 0) {
      const last = al.slice().sort((a,b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()).slice(-1)[0];
      const formatted = typeof last.initiator === 'string' ? formatInitiator(last.initiator) : formatInitiator((last.initiator as any) ?? undefined);
      return formatted;
    }
    // fallback to row.initiator
    return formatInitiator(row.initiator ?? undefined);
  };

  // Group rows by orderNumber to avoid duplicate table rows for the same order
  const groupedMap = new Map<string, MetaLogRow & { _rows: MetaLogRow[] }>();
  for (const r of rows) {
    const key = r.orderNumber ? String(r.orderNumber) : `id:${r.id}`;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, { ...r, _rows: [r] } as any);
    } else {
      const ex = groupedMap.get(key)!;
      ex._rows.push(r);
      // keep createdAt as the most recent
      if (new Date(r.createdAt).getTime() > new Date(ex.createdAt).getTime()) ex.createdAt = r.createdAt;
      // merge attempts/occurrenceCount loosely
      ex.attempts = (ex.attempts || 0) + (r.attempts || r.occurrenceCount || 0);
      // merge sourceIds
      const exIds = new Set(Array.isArray(ex.sourceIds) ? ex.sourceIds : []);
      for (const id of (r.sourceIds || [])) exIds.add(id);
      ex.sourceIds = Array.from(exIds);
    }
  }

  const groupedRows = Array.from(groupedMap.values());

  return (
    <div className="bg-white rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">{title || 'Відвантаження'}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
              <tr className="text-xs text-gray-500 border-b">
              <th className="px-3 py-2">Дата</th>
              <th className="px-3 py-2 max-w-25">Номер замовлення</th>
              <th className="px-3 py-2">Назва товару</th>
              <th className="px-3 py-2">Артикул</th>
              <th className="px-3 py-2">Потрібно</th>
              <th className="px-3 py-2">Залишок</th>
              <th className="px-3 py-2">Бракує</th>
              <th className="px-3 py-2">Ініціатор</th>
              <th className="px-3 py-2">Спроб</th>
              <th className="px-3 py-2">Дії</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && loading ? (
              <tr>
                <td className="text-center px-3 pt-14 pb-10 text-gray-500" colSpan={10}>
                  <DynamicIcon name="loader" size={24} className="mx-auto mb-2 text-gray-400 animate-spin" />
                  Завантаження...
                </td>
              </tr>
            ) : (
              rows.length === 0 && (
                <tr>
                  <td className="text-center px-3 pt-14 pb-10 text-gray-500" colSpan={10}>
                    <DynamicIcon name="file-search" size={24} className="mx-auto mb-2 text-gray-400" />
                    Немає записів
                  </td>
                </tr>
              )
            )}

            {groupedRows.filter(r => !hiddenIds.includes(r.id)).map((r) => {
              // combine attemptsList from all sub-rows to correctly render Tooltip/count
              const combinedAttemptsList = (() => {
                const map = new Map<string, any>();
                for (const sub of (r as any)._rows || [r]) {
                  if (Array.isArray(sub.attemptsList)) {
                    for (const a of sub.attemptsList) map.set(String(a.id), a);
                  }
                }
                return Array.from(map.values()).sort((a,b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
              })();
              // combine parsed data from all sub-rows for this order
              const allNames: string[] = [];
              const allSkus: string[] = [];
              const allNeeded: string[] = [];
              const allStock: string[] = [];
              const allMissing: string[] = [];
              for (const sub of (r as any)._rows || [r]) {
                const parsed = parseShipmentMessageUtil(sub);
                allNames.push(...parsed.names);
                allSkus.push(...parsed.skus);
                allNeeded.push(...parsed.needed);
                allStock.push(...parsed.stock);
                allMissing.push(...parsed.missing);
              }
              const parsed = dedupeAndNormalize({ names: allNames, skus: allSkus, needed: allNeeded, stock: allStock, missing: allMissing });
              return (
                <tr key={r.id} className={`border-b last:border-b-0 even:bg-gray-50 ${processingIds.includes(r.id) ? 'bg-yellow-200' : ''}`}>
                  <td className="px-3 py-2 align-top">
                    <Tooltip content={new Date(r.createdAt).toLocaleString()}>
                      <span className="whitespace-nowrap">{formatRelativeDate(r.createdAt)}</span>
                    </Tooltip>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.orderNumber ? (
                      <button onClick={() => openOrderDrawer(r.orderNumber)} className="text-primary-600 underline">
                        {r.orderNumber}
                      </button>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      {parsed.names && parsed.names.length > 0 ? parsed.names.map((n, i) => (<div key={i}>{n}</div>)) : (<div className="text-gray-600">—</div>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      {parsed.skus && parsed.skus.length > 0 ? parsed.skus.map((s, i) => (<div key={i}>{s}</div>)) : (<div className="text-gray-600">—</div>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      {parsed.needed && parsed.needed.length > 0 ? parsed.needed.map((v, i) => (<div key={i}>{v}</div>)) : (<div className="text-gray-600">—</div>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      {parsed.stock && parsed.stock.length > 0 ? parsed.stock.map((v, i) => (<div key={i}>{v}</div>)) : (<div className="text-gray-600">—</div>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-red-600 font-medium">
                    <div className="flex flex-col gap-1">
                      {parsed.missing && parsed.missing.length > 0 ? parsed.missing.map((v, i) => (<div key={i}>{v}</div>)) : (<div className="text-gray-600">—</div>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">{getInitiatorDisplay({ ...(r as any), attemptsList: combinedAttemptsList })}</td>
                  <td className="px-3 py-2 align-top">
                    {Array.isArray(combinedAttemptsList) && combinedAttemptsList.length > 1 ? (
                      <Tooltip content={renderAttemptsTooltip(combinedAttemptsList)}>
                        <span className="underline cursor-help">{combinedAttemptsList.length}</span>
                      </Tooltip>
                    ) : (
                      (r.attempts ?? r.occurrenceCount ?? '—')
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {isAdmin ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setProcessingIds(prev => [...prev, r.id]);
                              try {
                                const ids = r.sourceIds && r.sourceIds.length > 0 ? r.sourceIds : [r.id];
                                if (onResolve) await onResolve(ids);
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
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); openLogDrawer(r); }}
                            title="Переглянути лог"
                            className="flex items-center gap-1 text-[11px] text-primary-700 bg-primary-50 hover:bg-primary-100 px-2 py-0.5 rounded-full transition-colors border border-primary-200"
                          >
                            Log
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <button
                          onClick={(e) => { e.stopPropagation(); openLogDrawer(r); }}
                          title="Переглянути лог"
                          className="flex items-center gap-1 text-[11px] text-primary-700 bg-primary-50 hover:bg-primary-100 px-2 py-0.5 rounded-full transition-colors border border-primary-200"
                        >
                          Log
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
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

      {/* Log Drawer: показ повного логу події */}
      <Drawer isOpen={logOpen} onOpenChange={(open) => { if (!open) closeLogDrawer(); }} placement="bottom" size="lg">
        <DrawerContent>
          {(onClose) => (
            <>
              <DrawerHeader>Повний лог події {logRow && (logRow.orderNumber ? `#${logRow.orderNumber}` : `id:${logRow.id}`)}</DrawerHeader>
              <DrawerBody className="overflow-y-auto p-4">
                {logRow ? (
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-sm text-gray-700">Лог події — підсумок</div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const text = JSON.stringify(logRow, null, 2);
                              await navigator.clipboard.writeText(text);
                            } catch (err) {
                              // ignore
                            }
                          }}
                          className="text-sm px-3 py-1 rounded border bg-white hover:bg-gray-50"
                        >Копіювати</button>
                      </div>
                    </div>

                    <div className="mb-3 text-sm">
                      <div><strong>Замовлення:</strong> {logRow.orderNumber ?? '—'}</div>
                      <div><strong>Створено:</strong> {logRow.createdAt ? new Date(logRow.createdAt).toLocaleString('uk-UA') : '—'}</div>
                      <div><strong>Ініціатор:</strong> {getInitiatorDisplay(logRow)}</div>
                    </div>

                    <div className="mb-3">
                      <strong className="text-sm">Спроби:</strong>
                      <div className="mt-2 text-xs">
                        {getCombinedAttempts(logRow).map((a:any) => {
                          const rawInitiator = typeof a.initiator === 'string' ? a.initiator : (a.initiator && ((a.initiator as any).name ?? (a.initiator as any).raw)) ?? JSON.stringify(a.initiator);
                          const mapped = formatInitiator(a.initiator);
                          return (
                            <div key={String(a.id)} className="py-0.5">{new Date(a.datetime).toLocaleString('uk-UA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit', second:'2-digit' })} – {mapped}{rawInitiator ? ` (${rawInitiator})` : ''}</div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mb-3">
                      <strong className="text-sm">Підрядки (деталі):</strong>
                      <div className="mt-2 text-xs">
                        {Array.isArray((logRow as any)._rows) ? (logRow as any)._rows.map((sub:any) => (
                          <div key={sub.id} className="py-1 border-b last:border-b-0 pb-2">
                            <div><strong>{sub.title ?? sub.productName ?? '—'}</strong> — {sub.createdAt ? new Date(sub.createdAt).toLocaleString('uk-UA') : '—'}</div>
                            <div className="text-gray-600">Товар: {sub.productName ?? '—'} {sub.sku ? `| ${sub.sku}` : ''}</div>
                            <div className="text-gray-600 mt-1">Повідомлення: {sub.rawMessage ? <span className="whitespace-pre-wrap">{String(sub.rawMessage)}</span> : '—'}</div>
                          </div>
                        )) : (<div className="text-gray-500">Немає підрядків</div>)}
                      </div>
                    </div>

                    <div>
                      <strong className="text-sm">Повідомлення (raw):</strong>
                      <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded border mt-2">{String(logRow.rawMessage ?? logRow.dilovodResponse ?? '—')}</pre>
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
