import React, { useMemo, useState } from 'react';
import { normalizeItemsArray as clientNormalizeItems, normalizeSetsArray as clientNormalizeSets } from '@/pages/Warehouse/shared/historyNormalize';
import type { HistoryItemNormalized, HistorySetNormalized } from '@/pages/Warehouse/shared/historyNormalize';
import { DynamicIcon } from 'lucide-react/dynamic';

type Mode = 'normal' | 'sets';

interface Props {
  title?: string;
  mode?: Mode;
  items?: any[]; // raw or normalized
  sets?: any[]; // raw or normalized
  className?: string;
}

function compareValues(a: any, b: any, numeric = false) {
  if (numeric) return (Number(a) || 0) - (Number(b) || 0);
  return String(a || '').localeCompare(String(b || ''), 'uk');
}

export const HistoryItemsTable: React.FC<Props> = ({ title = 'Товари', mode = 'normal', items = [], sets = [], className }) => {
  const [sortBy, setSortBy] = useState<string | null>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const normalizedItems: HistoryItemNormalized[] = useMemo(() => {
    if (!items) return [];
    if (items.length > 0 && items[0] && ('qty' in items[0] || 'sku' in items[0])) return items as HistoryItemNormalized[];
    return clientNormalizeItems(items);
  }, [items]);

  const normalizedSets: HistorySetNormalized[] = useMemo(() => {
    if (!sets) return [];
    if (sets.length > 0 && sets[0] && 'components' in sets[0]) return sets as HistorySetNormalized[];
    return clientNormalizeSets(sets);
  }, [sets]);

  const toggleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortBy) return normalizedItems;
    const numeric = sortBy === 'qty';
    const copy = [...normalizedItems];
    copy.sort((a, b) => compareValues(a[sortBy as keyof HistoryItemNormalized], b[sortBy as keyof HistoryItemNormalized], numeric));
    if (sortDir === 'desc') copy.reverse();
    return copy;
  }, [normalizedItems, sortBy, sortDir]);

  const sortedSets = useMemo(() => {
    if (!sortBy) return normalizedSets;
    const numeric = sortBy === 'qty' || sortBy === 'setQty';
    return normalizedSets.map(s => {
      const comps = [...s.components];
      comps.sort((a, b) => compareValues(a[sortBy as keyof HistoryItemNormalized], b[sortBy as keyof HistoryItemNormalized], numeric));
      if (sortDir === 'desc') comps.reverse();
      return { ...s, components: comps };
    });
  }, [normalizedSets, sortBy, sortDir]);

  if (mode === 'sets') {
    return (
      <div className="flex flex-col gap-6">
        {sortedSets.map((s, idx) => (
          <div key={`set-${idx}`} className={`overflow-x-auto px-1 pb-1 bg-gray-200 rounded-md ${className ?? ''}`}>
            <div className="flex items-center gap-2 px-2 py-2">
              <span className="text-sm bg-amber-200/80 ring-1 ring-amber-100 px-1 py-0 rounded">{s.setSku}</span>
              <h4 className="text-md font-medium text-gray-700">{s.setName}
                <span className="text-xs mx-2">✕</span>
                <span>{s.setQty} шт.</span>
              </h4>
            </div>
            <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md text-sm bg-white">
              <thead>
								<tr className="border-b border-gray-200 bg-gray-100 [&>th]:text-left [&>th]:py-2 [&>th]:px-3 [&>th]:font-semibold [&>th]:text-gray-600">
									<th onClick={() => toggleSort('sku')} className="cursor-pointer">
										<div className="flex items-center gap-1">SKU <DynamicIcon name={sortBy !== 'sku' ? 'arrow-up-down' : (sortDir === 'asc' ? 'arrow-up' : 'arrow-down')} className={`w-3 h-3 inline ${sortBy === 'sku' ? 'text-blue-500' : 'text-gray-400'}`} /></div>
									</th>
									<th onClick={() => toggleSort('name')} className="cursor-pointer">
										<div className="flex items-center gap-1">Позиція <DynamicIcon name={sortBy !== 'name' ? 'arrow-up-down' : (sortDir === 'asc' ? 'arrow-up' : 'arrow-down')} className={`w-3 h-3 inline ${sortBy === 'name' ? 'text-blue-500' : 'text-gray-400'}`} /></div>
									</th>
									<th onClick={() => toggleSort('batch')} className="cursor-pointer">
										<div className="flex items-center gap-1">Партія <DynamicIcon name={sortBy !== 'batch' ? 'arrow-up-down' : (sortDir === 'asc' ? 'arrow-up' : 'arrow-down')} className={`w-3 h-3 inline ${sortBy === 'batch' ? 'text-blue-500' : 'text-gray-400'}`} /></div>
									</th>
									<th onClick={() => toggleSort('qty')} className="cursor-pointer text-center!">
										<div className="flex items-center gap-1 justify-center">Кількість <DynamicIcon name={sortBy !== 'qty' ? 'arrow-up-down' : (sortDir === 'asc' ? 'arrow-up' : 'arrow-down')} className={`w-3 h-3 inline ${sortBy === 'qty' ? 'text-blue-500' : 'text-gray-400'}`} /></div>
									</th>
								</tr>
							</thead>
              <tbody>
                {s.components.map((c, compIdx) => (
                  <tr key={`set-${idx}-comp-${compIdx}`} className="[&>td]:py-2 [&>td]:px-3 [&>td]:border-b [&>td]:border-b-gray-100 text-gray-700">
                    <td className="font-mono">{c.sku}</td>
                    <td>{c.name}</td>
                    <td>{c.batch || '–'}</td>
                    <td className="text-center font-semibold">{c.qty}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 [&>td]:font-semibold [&>td]:py-2 [&>td]:px-3">
                  <td></td>
                  <td></td>
                  <td className="text-right">Всього:</td>
                  <td className="text-center">{s.componentsTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto px-1 pb-1 bg-gray-200 rounded-md ${className ?? ''}`}>
			<div className="flex items-center gap-2 justify-between px-3 py-2 rounded-t-md border-1 border-b-0 border-gray-200">
				<h4 className="text-md font-medium text-gray-700">{title} <span className="text-gray-500 text-sm font-normal">({items.length})</span></h4>
			</div>
      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md text-sm bg-white border-1 border-gray-200">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-100 [&>th]:text-left [&>th]:py-2 [&>th]:px-3 [&>th]:font-semibold [&>th]:text-gray-600">
            <th onClick={() => toggleSort('sku')} className="cursor-pointer">
              <div className="flex items-center gap-1">SKU <DynamicIcon name={sortBy !== 'sku' ? 'arrow-up-down' : (sortDir === 'asc' ? 'arrow-up' : 'arrow-down')} className={`w-3 h-3 inline ${sortBy === 'sku' ? 'text-blue-500' : 'text-gray-400'}`} /></div>
            </th>
            <th onClick={() => toggleSort('name')} className="cursor-pointer">
							<div className="flex items-center gap-1">Позиція <DynamicIcon name={sortBy !== 'name' ? 'arrow-up-down' : (sortDir === 'asc' ? 'arrow-up' : 'arrow-down')} className={`w-3 h-3 inline ${sortBy === 'name' ? 'text-blue-500' : 'text-gray-400'}`} /></div>
            </th>
            <th onClick={() => toggleSort('batch')} className="cursor-pointer">
							<div className="flex items-center gap-1">Партія <DynamicIcon name={sortBy !== 'batch' ? 'arrow-up-down' : (sortDir === 'asc' ? 'arrow-up' : 'arrow-down')} className={`w-3 h-3 inline ${sortBy === 'batch' ? 'text-blue-500' : 'text-gray-400'}`} /></div>
						</th>
            <th onClick={() => toggleSort('qty')} className="cursor-pointer text-center!">
							<div className="flex items-center gap-1 justify-center">Кількість <DynamicIcon name={sortBy !== 'qty' ? 'arrow-up-down' : (sortDir === 'asc' ? 'arrow-up' : 'arrow-down')} className={`w-3 h-3 inline ${sortBy === 'qty' ? 'text-blue-500' : 'text-gray-400'}`} /></div>
						</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, idx) => (
            <tr key={idx} className="[&>td]:py-2 [&>td]:px-3 [&>td]:border-b [&>td]:border-b-gray-100 text-gray-700">
              <td className="font-mono">{item.sku}</td>
              <td>{item.name}</td>
              <td>{item.batch || '–'}</td>
              <td className="text-center font-semibold">{item.qty}</td>
            </tr>
          ))}
          <tr className="bg-gray-50 [&>td]:font-semibold [&>td]:py-2 [&>td]:px-3">
            <td></td>
            <td></td>
            <td className="text-right">Всього:</td>
            <td className="text-center">{sortedItems.reduce((s, it) => s + Number(it.qty || 0), 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default HistoryItemsTable;
