import { Divider } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useMemo } from 'react';
import type {
  CatalogDictItemDto,
  CatalogGoodUsedInDto,
  CatalogGoodUsedInScope,
} from '../../ProductsTypes';

interface UsedInSectionProps {
  goodId: string;
  scope: CatalogGoodUsedInScope;
  units: CatalogDictItemDto[];
  onOpenNested: (parentGoodId: string) => void;
}

const SCOPE_META: Record<
  CatalogGoodUsedInScope,
  { title: string; icon: IconName; qtyLabel: string }
> = {
  products: {
    title: 'Використовується в стравах',
    icon: 'utensils-crossed',
    qtyLabel: 'Кількість',
  },
  kits: {
    title: 'Використовується в комплектах',
    icon: 'package',
    qtyLabel: 'Кількість',
  },
};

async function fetchGoodUsedIn(
  goodId: string,
  scope: CatalogGoodUsedInScope
): Promise<CatalogGoodUsedInDto[]> {
  const params = new URLSearchParams({ scope });
  const res = await fetch(`/api/catalog/goods/${goodId}/used-in?${params.toString()}`, {
    credentials: 'include',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return (json.data as CatalogGoodUsedInDto[]) || [];
}

function formatQty(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toFixed(3).replace(/\.?0+$/, '').replace('.', ',');
}

export function UsedInSection({ goodId, scope, units, onOpenNested }: UsedInSectionProps) {
  const meta = SCOPE_META[scope];
  const unitNameById = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);

  const query = useQuery({
    queryKey: ['catalog', 'good', goodId, 'used-in', scope],
    queryFn: () => fetchGoodUsedIn(goodId, scope),
    enabled: Boolean(goodId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (query.isLoading || query.isError || !query.data?.length) {
    return null;
  }

  return (
    <>
      <Divider className="bg-default-200/60" />
      <section className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1">
          <DynamicIcon name={meta.icon} size={14} />
          <span>{meta.title}</span>
        </h3>

        <div className="hidden md:flex flex-nowrap items-center gap-2 px-0.5 py-2.5 mb-0 rounded-md bg-default-100">
          <span className="text-xs font-semibold text-default-500 text-right min-w-4.5 tabular-nums">
            #
          </span>
          <span className="min-w-0 flex-1 text-xs font-semibold text-default-500">
            {scope === 'kits' ? 'Назва комплекту' : 'Назва страви'}
          </span>
          <span className="w-24 text-xs font-semibold text-default-500 text-center">
            {meta.qtyLabel}
          </span>
        </div>

        <div className="flex flex-col gap-0">
          {query.data.map((row, index) => {
            const unitName = row.unitId ? unitNameById.get(row.unitId) : null;
            return (
              <div
                key={row.parentGoodId}
                className="flex flex-col gap-1.5 [&:not(:last-child)]:border-b border-default-200/60 py-2.5"
              >
                <div className="flex flex-wrap md:flex-nowrap items-center gap-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-right min-w-5 tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex items-center gap-2 text-left hover:text-primary"
                      onClick={() => onOpenNested(row.parentGoodId)}
                    >
                      <span className="truncate text-sm hover:underline">{row.parentName}</span>
                      {row.parentSku && (
                        <span className="font-mono text-xs text-default-400 px-1 py-0.5 bg-default-100 rounded shrink-0">
                          {row.parentSku}
                        </span>
                      )}
                    </button>
                  </div>
                  <span className="text-sm tabular-nums text-default-600 ml-7 md:ml-0 w-full md:w-24 text-right pr-6">
                    {formatQty(row.qty)}
                    {unitName ? ` ${unitName}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
