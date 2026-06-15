import React, { useState, useRef, useEffect } from 'react';
import { Input, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface Props { onSelect: (s: any) => void; existingItems?: any[]; resetSignal?: number }

export default function SetSearchPanel({ onSelect, existingItems = [], resetSignal }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const selectedSet = existingItems[0] ?? null;
  const hasSelectedSet = Boolean(selectedSet);
  const selectedSetName = selectedSet?.name || selectedSet?.title || selectedSet?.sku || '';

  useEffect(() => {
    if (typeof resetSignal !== 'undefined') {
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (hasSelectedSet) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    if (!query || query.trim().length < 3) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    const handle = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=20`, { signal: abortRef.current.signal, credentials: 'include' });
        const json = await res.json();
        const list = json?.products || [];
        // filter for product sets (store parsed set array)
        const sets = list.map((p:any) => ({ ...p, set: p.set ? (typeof p.set === 'string' ? (() => { try { return JSON.parse(p.set); } catch { return null; } })() : p.set) : null })).filter((p:any) => Array.isArray(p.set) && p.set.length > 0);
        setResults(sets);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { clearTimeout(handle); };
  }, [query, hasSelectedSet]);

  const addedSkus = (existingItems || []).map((it:any) => it.setSku || it.sku);
  const addedSet = new Set(addedSkus);
  const isAdded = (sku: string) => addedSet.has(sku);

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onValueChange={setQuery}
        placeholder="Пошук набору за назвою або SKU (від 3 символів)"
        size="lg"
        className="w-full"
        isClearable={true}
        isDisabled={hasSelectedSet}
        startContent={<DynamicIcon name="search" className="text-gray-400" size={18} />}
        classNames={{ inputWrapper: 'rounded-lg border border-gray-200 bg-white' }}
        onKeyDown={(event) => {
          if (hasSelectedSet) {
            event.preventDefault();
            return;
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            void (async () => {
              setLoading(true);
              try {
                const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=20`, { credentials: 'include' });
                const json = await res.json();
                const list = json?.products || [];
                const sets = list.map((p:any) => ({ ...p, set: p.set ? (typeof p.set === 'string' ? (() => { try { return JSON.parse(p.set); } catch { return null; } })() : p.set) : null })).filter((p:any) => Array.isArray(p.set) && p.set.length > 0);
                setResults(sets);
              } catch (e) {
                setResults([]);
              } finally { setLoading(false); }
            })();
          }
        }}
      />

      {!loading && results.length === 0 && hasSearched && query.trim() !== '' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          Набори не знайдено. Спробуйте іншу назву або SKU.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((p: any) => (
            <Button
              key={p.id || p.sku}
              type="button"
              size="lg"
              color="primary"
              variant={isAdded(p.sku) || hasSelectedSet ? 'flat' : 'solid'}
              onPress={() => onSelect({ sku: p.sku, name: p.name || p.title || p.displayName || p.sku, quantity: 1, componentsSnapshot: p.set })}
              isDisabled={isAdded(p.sku) || hasSelectedSet}
              className={`h-auto w-full items-stretch justify-start rounded-lg border border-gray-200 px-4 py-3 text-left ${(isAdded(p.sku) || hasSelectedSet) ? 'bg-gray-100 opacity-40' : 'bg-white'}`}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex-1 text-left">
                  <div className="text-md font-semibold text-gray-900">
                    {p.name || p.title || p.displayName}
                    <span className="ml-1 rounded bg-gray-200/50 px-1 py-0.5 text-sm font-normal text-gray-400">SKU: {p.sku || p.code || p.id}</span>
                  </div>
                  <div className="text-sm text-gray-600">Компонентів: {Array.isArray(p.set) ? p.set.length : 0}</div>
                </div>
                <div className="shrink-0 text-sm font-semibold">{isAdded(p.sku) ? 'Додано' : 'Додати'}</div>
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
