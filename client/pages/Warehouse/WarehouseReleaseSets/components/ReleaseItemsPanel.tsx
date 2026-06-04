import { useMemo, useEffect, useState } from 'react';
import { Button, Card, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { StepperInput } from '../../shared/StepperInput';

interface Props { items: any[]; onChange: (id: string, patch: Partial<any>) => void; onRemove: (id: string) => void; selectedStorage?: string | null; returns?: any }

export default function ReleaseItemsPanel({ items, onChange, onRemove, selectedStorage, returns }: Props) {
  const [namesMap, setNamesMap] = useState<Record<string, string>>({});
  const [isSetMap, setIsSetMap] = useState<Record<string, boolean>>({});
  const [setItemsMap, setSetItemsMap] = useState<Record<string, any[]>>({});
  const [aggregatedServer, setAggregatedServer] = useState<Record<string, { name?: string; sku: string; total: number }> | null>(null);
  const [aggLoading, setAggLoading] = useState(false);

  if (!items || items.length === 0) return null;

  // Fetch missing component names from server when needed
  useEffect(() => {
    // SKUs where we need to fetch names (only missing names)
    const nameNeededSkus = new Set<string>();
    // SKUs to check whether product is a set (include all component SKUs + top-level set SKUs)
    const setCheckSkus = new Set<string>();

    for (const it of items) {
      const comps = Array.isArray(it.componentsSnapshot) ? it.componentsSnapshot : [];
      for (const c of comps) {
        const compSku = String(c.id ?? c.sku ?? c.code ?? (c['id'] ?? c['sku'] ?? '')).trim();
        if (!compSku) continue;
        setCheckSkus.add(compSku);
        if (!c.name) nameNeededSkus.add(compSku);
      }
    }

    // Also include top-level set SKUs so we can detect nested sets
    for (const it of items) {
      if (it.setSku) {
        const s = String(it.setSku).trim();
        if (s) setCheckSkus.add(s);
      }
    }

    // Combine SKUs to fetch (we always request `set` for all setCheckSkus;
    // names are optional but harmless to request for the same set)
    const skus = Array.from(new Set([...Array.from(setCheckSkus), ...Array.from(nameNeededSkus)]));
    if (skus.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        // Normalize and chunk SKUs to avoid too-long GET URLs.
        const normalized = Array.from(new Set(skus.map(s => String(s).trim())));
        const chunkSize = 50;
        const allProducts: any[] = [];

        const chunks: string[][] = [];
        for (let i = 0; i < normalized.length; i += chunkSize) chunks.push(normalized.slice(i, i + chunkSize));

        await Promise.all(chunks.map(async (chunk) => {
          const res = await fetch(`/api/products/batch?skus=${encodeURIComponent(chunk.join(','))}&fields=name,set`, { credentials: 'include' });
          if (!res.ok) return;
          const json = await res.json().catch(() => null);
          if (!json) return;
          const list = json?.products || [];
          allProducts.push(...list);
        }));

        const map: Record<string, string> = {};
        const setFlagMap: Record<string, boolean> = {};
        const setItems: Record<string, any[]> = {};
        for (const p of allProducts) {
          if (p && p.sku) {
            const sku = String(p.sku).trim();
            if (p.name) map[sku] = p.name;
            const hasSet = !!(p.set && ((Array.isArray(p.set) && p.set.length > 0) || (typeof p.set === 'string' && p.set.trim().length > 0)));
            setFlagMap[sku] = hasSet;
            if (hasSet) {
              // normalize set items to array of { id/sku, quantity, name }
              const itemsArr = Array.isArray(p.set) ? p.set : [];
              setItems[sku] = itemsArr.map((it: any) => ({ id: it.id ?? it.sku, sku: it.id ?? it.sku, quantity: it.quantity ?? 1, name: it.name }));
            }
          }
        }

        if (!cancelled) {
          setNamesMap((prev) => ({ ...prev, ...map }));
          setIsSetMap((prev) => ({ ...prev, ...setFlagMap }));
          setSetItemsMap((prev) => ({ ...prev, ...setItems }));
        }
      } catch (e) {
        // ignore
      }
    })();

    return () => { cancelled = true; };
  }, [items]);

  // Compute aggregated totals per component SKU across all selected sets
  const aggregated = useMemo(() => {
    // Prefer server-side aggregated result if available
    if (aggregatedServer) return aggregatedServer;

    const map: Record<string, { name?: string; sku: string; total: number; perSet?: number }> = {};
    for (const it of items) {
      const qty = Number(it.quantity || 0);
      const comps = Array.isArray(it.componentsSnapshot) ? it.componentsSnapshot : [];
      for (const c of comps) {
        const compSku = String(c.id ?? c.sku ?? c.code ?? (c["id"] ?? c["sku"] ?? '')).trim();
        if (!compSku) continue;
        const perSet = Number(c.quantity ?? c.qty ?? 1);
        const add = perSet * qty;
        const nameFallback = c.name || c.title || undefined;
        if (!map[compSku]) map[compSku] = { name: nameFallback, sku: compSku, total: 0, perSet };
        map[compSku].total += add;
      }
    }
    return map;
  }, [items, /* include namesMap to update aggregates when names are fetched */ namesMap, aggregatedServer]);

  // Fetch server-side aggregated preview (recursive) when items change
  useEffect(() => {
    let cancelled = false;
    const shouldCall = Array.isArray(items) && items.length > 0;
    if (!shouldCall) {
      setAggregatedServer(null);
      return;
    }

    const timer = setTimeout(async () => {
      setAggLoading(true);
      try {
        const body = { items: items.map((it) => ({ set_sku: it.setSku, quantity: it.quantity })) };
        const resp = await fetch('/api/warehouse/releases/preview', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!resp.ok) return;
        const json = await resp.json().catch(() => null);
        if (!json || !json.success || !Array.isArray(json.data)) return;
        const map: Record<string, { name?: string; sku: string; total: number }> = {};
        for (const c of json.data) {
          if (!c || !c.sku) continue;
          map[c.sku] = { name: c.name || undefined, sku: c.sku, total: Number(c.quantity || 0) };
        }
        if (!cancelled) setAggregatedServer(map);
      } catch (e) {
        // ignore
      } finally {
        if (!cancelled) setAggLoading(false);
      }
    }, 200);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [items]);

  return (
    <>
		<h3 className="font-medium mb-2">Набори для випуску</h3>
    <Card className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
      {items.map((it) => (
        <div key={it.id} className="border-b border-gray-100 pb-6 mb-4 last:border-b-0 last:mb-0 last:pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <span className="text-xs font-medium text-gray-500 mb-1">Товар</span>
              <div className="flex flex-col items-start">
                <span className="font-semibold text-gray-900">{it.name}</span>
                <span className="text-xs font-normal text-gray-600 bg-amber-200/50 px-1 py-0.5 rounded">SKU: {it.setSku}</span>
              </div>
            </div>

            <div className="flex items-end gap-4">
              <StepperInput
                label="Кількість наборів"
                value={Number(it.quantity ?? 0)}
                onChange={(v:number) => onChange(it.id, { quantity: v })}
                onIncrement={() => onChange(it.id, { quantity: Number(it.quantity ?? 0) + 1 })}
                onDecrement={() => onChange(it.id, { quantity: Math.max(0, Number(it.quantity ?? 0) - 1) })}
                size="sm"
                className="w-32"
                labelClassName="text-xs font-medium self-start"
              />

              <Button
                color="danger"
                variant="light"
                className="min-w-0 p-3"
                onPress={() => onRemove(it.id)}
              >
                <DynamicIcon name="trash-2" className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Components list for this set */}
          <div className="mt-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Компоненти набору ({it.componentsSnapshot.length})</div>
            {Array.isArray(it.componentsSnapshot) && it.componentsSnapshot.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {it.componentsSnapshot.map((c: any, idx: number) => {
                  const compKey = String(c.id ?? c.sku ?? '').trim();
                  return (
                    <div key={compKey || idx} className="flex items-center justify-between gap-3 py-1 px-2 rounded-sm bg-indigo-50 border border-indigo-100">
                      <div className="text-sm">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-800">{c.name || c.title || namesMap[compKey] || c.id || c.sku}</div>
                          {isSetMap[String(compKey)] && (
                            <Popover showArrow placement="right">
                              <PopoverTrigger>
                                <button type="button" className="text-xs text-indigo-700 bg-indigo-100 border border-indigo-200 px-1 rounded">Набір</button>
                              </PopoverTrigger>
                              <PopoverContent className="p-3 bg-white border border-gray-200 shadow-lg">
                                <div className="font-semibold mb-2 max-w-60 text-center leading-tight">Склад набору «{c.name || c.title || namesMap[compKey] || c.id || c.sku}»</div>
                                <div className="max-h-80 overflow-auto text-[13px]">
                                  {(setItemsMap[compKey] || []).map((s: any) => (
                                    <div key={s.sku} className="flex items-end justify-between gap-4">
                                      <div>{s.name || namesMap[s.sku] || s.sku}</div>
                                      <div>{s.quantity} шт.</div>
                                    </div>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">SKU: {c.id || c.sku}</div>
                      </div>
                      <div className="text-right text-xs text-gray-700">
                        <div>В наборі: <strong>{Number(c.quantity ?? c.qty ?? 1)} шт.</strong></div>
                        <div>Разом: <strong>{Number(c.quantity ?? c.qty ?? 1) * Number(it.quantity ?? 0)} шт.</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Компоненти не вказані</div>
            )}
          </div>
        </div>
      ))}
    </Card>

    {/* Aggregated totals across all sets */}
    <h3 className="text-lg font-medium mb-2">Сумарно до списання зі складу {selectedStorage || 'не вказано'} – {Object.values(aggregated).reduce((sum, a) => sum + a.total, 0)} шт.</h3>
    <Card className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
      <div className="space-y-2">
        {Object.keys(aggregated).length === 0 && <div className="text-sm text-gray-500">Немає компонентів для списання</div>}
        {Object.values(aggregated).map((a) => (
          <div key={a.sku} className="flex items-center justify-between gap-4 py-2 px-3 rounded-md border border-gray-100 bg-white">
            <div>
              <div className="font-medium text-gray-800">{a.name || namesMap[a.sku] || a.sku}</div>
              <div className="text-xs text-gray-500">SKU: {a.sku}</div>
            </div>
            <div className="text-sm font-semibold text-gray-900">{a.total}</div>
          </div>
        ))}
      </div>
    </Card>
		</>
  );
}
