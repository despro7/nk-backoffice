import { useState, useRef, useEffect } from 'react';
import { Input, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface Props {
  writeoff: any;
  returns: any;
  resetSignal?: number;
}

export default function ProductSearchPanel({ writeoff, returns, resetSignal }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // clear local query/results only when resetSignal changes
  useEffect(() => {
    if (typeof resetSignal !== 'undefined') {
      setQuery('');
      writeoff.setProductSearchResults?.([]);
      setHasSearched(false);
      setLoading(false);
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (!query || query.trim().length < 3) {
      writeoff.setProductSearchResults?.([]);
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
        await writeoff.searchProducts(query);
      } catch (e) {
        // hook handles errors
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const onSelect = async (product: any) => {
    const qty = 1;
    // prepare item compatible with returns.items
    const id = crypto.randomUUID?.() ?? `${product.sku}-${Date.now()}-${Math.random()}`;
    const newItem = {
      id,
      sku: product.sku || product.code || product.id,
      name: product.name || product.title || product.displayName || product.sku,
      dilovodId: product.dilovodId ?? null,
      quantity: qty,
      orderedQuantity: product.stock ?? qty,
      portionsPerBox: product.portionsPerBox ?? 1,
      firmId: product.firmId ?? returns.shipFirmId ?? returns.receiveFirmId ?? null,
      availableBatches: null,
      selectedBatchId: null,
      selectedBatchKey: null,
      price: product.price ?? 0,
    };
    returns.setItems([...(returns.items || []), newItem]);
    // trigger batch loading — hook watches items length and will fetch batches
  };

  const results = writeoff.productSearchResults || [];
  const addedSkus = (returns.items || []).map((it:any) => it.sku);
  const addedSet = new Set(addedSkus);
  const isAdded = (sku: string) => addedSet.has(sku);

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full">
        <Input
          value={query}
          onValueChange={setQuery}
          placeholder="Пошук товару за назвою або SKU (від 3 символів)"
          size="lg"
          className="w-full"
          isClearable={true}
          startContent={<DynamicIcon name="search" className="text-gray-400" size={18} />}
          classNames={{ inputWrapper: 'rounded-lg border border-gray-200 bg-white' }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void writeoff.searchProducts?.(query);
            }
          }}
        />
      </div>

      {!loading && results.length === 0 && hasSearched && query.trim() !== '' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          Товар не знайдено. Спробуйте іншу назву або SKU.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((p: any) => (
            <div key={p.id || p.sku} className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-gray-200 ${isAdded(p.sku) ? 'bg-gray-100' : 'bg-white'}`}>
              <div className={`flex-1 text-left ${isAdded(p.sku) ? 'opacity-40' : ''}`}>
                <div className="text-md font-semibold text-gray-900">{p.name || p.title || p.displayName || p.sku}</div>
                <div className="text-sm text-gray-500">SKU: {p.sku || p.code || p.id}</div>
                <div className="text-sm text-gray-600">{p.stock != null ? `На складі: ${p.stock}` : null}</div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="md"
                  color="danger"
                  onPress={() => { void onSelect(p); }}
                  isDisabled={isAdded(p.sku)}
                  >
                    {isAdded(p.sku) ? 'Додано до списання' : 'Додати'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
