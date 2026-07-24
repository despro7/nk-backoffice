import { Fragment, type ReactNode } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Tooltip, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { formatRelativeDate } from '@/lib/formatUtils';
import { StockBadge } from '@/components/StockBadge';
import { ToastService } from '@/services/ToastService';
import CompactBalance from './CompactBalance';
import type { ProductHistoryEntry } from '../WarehouseInventoryTypes';

interface InventoryHistoryRowProps {
  sessionId: string;
  item: any;
  total: number | null;
  dev: number | null; // deviation (відхилення від обліку)
  totalGp?: number | null;
  devGp?: number | null;
  rowKey: string;
  expandedRowKey: string | null;
  rowHistoryCache: Record<string, ProductHistoryEntry[]>;
  rowHistoryLoading: string | null;
  setCompositionBySku: Record<string, any[]>;
  onRowClick: (sessionId: string, sku: string) => void;
}

/** Копіювання тексту в буфер з toast-підтвердженням. */
function copyToClipboard(text: string, label: string): void {
  void navigator.clipboard.writeText(text).then(() => {
    ToastService.show({
      title: 'Скопійовано',
      description: label,
      color: 'success',
      timeout: 2000,
    });
  }).catch(() => {
    ToastService.show({
      title: 'Не вдалося скопіювати',
      color: 'danger',
      timeout: 3000,
    });
  });
}

function escapeTableCell(value: string): string {
  return value.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

function formatDeviationCell(value: number | null | undefined): string {
  if (value == null) return '–';
  return value > 0 ? `+${value}` : String(value);
}

function buildProductCopyRowText(
  sku: string,
  name: string,
  deviationMs: number | null,
  deviationGp: number | null | undefined,
): string {
  return [
    escapeTableCell(sku),
    escapeTableCell(name),
    formatDeviationCell(deviationMs),
    formatDeviationCell(deviationGp ?? null),
  ].join('\t');
}

/** Рендер підписаного значення руху (переміщення / комплектування). */
function renderSignedValue(value: number | null | undefined): ReactNode {
  if (value == null || value === 0) return '–';
  return (
    <span className={`font-medium ${value > 0 ? 'text-blue-600' : 'text-red-600'}`}>
      {value > 0 ? '+' : '-'}{Math.abs(value)}
    </span>
  );
}

/** Рендер позитивного приходу (повернення). */
function renderPositiveValue(value: number | null | undefined): ReactNode {
  if (value == null || value === 0) return '–';
  return <span className="text-green-600 font-medium">+{Math.abs(value)}</span>;
}

/** Рендер списання (завжди зі знаком −). */
function renderNegativeValue(value: number | null | undefined): ReactNode {
  if (value == null || value === 0) return '–';
  return <span className="text-red-600 font-medium">-{Math.abs(value)}</span>;
}

const historyTooltipClassNames = {
  base: 'before:bg-white before:rounded-[3px] before:z-10',
  content: 'bg-white border-1 text-gray-700 text-xs p-2 px-3 max-w-md',
} as const;

/** Табличний tooltip для комплектацій товару як компонента наборів. */
function renderKitDetailsTooltip(
  details: NonNullable<ProductHistoryEntry['kitDetails']>,
): ReactNode {
  return (
    <table className="w-full border-collapse text-left tabular-nums">
      <thead>
        <tr className="text-gray-400 border-b border-gray-200">
          <th className="py-1 pr-3 font-medium whitespace-nowrap">Операція</th>
          <th className="py-1 pr-3 font-medium">Набір</th>
          <th className="py-1 pr-3 font-medium text-right whitespace-nowrap">К-сть</th>
          <th className="py-1 font-medium text-center whitespace-nowrap">Склад</th>
        </tr>
      </thead>
      <tbody>
        {details.map((detail, index) => {
          const isKit = detail.operationType === 'kit';
          const signed =
            detail.signedQuantity > 0
              ? `+${detail.signedQuantity}`
              : String(detail.signedQuantity);
          return (
            <tr
              key={`${detail.setSku}-${detail.operationType}-${detail.storage}-${index}`}
              className="border-b border-gray-100 last:border-b-0"
            >
              <td className="py-1 pr-3 whitespace-nowrap text-gray-500">
                {isKit ? 'Комплект.' : 'Розкомпл.'}
              </td>
              <td className="py-1 pr-3 max-w-[180px]">
                <div className="truncate font-medium text-gray-800" title={detail.setName || detail.setSku}>
                  {detail.setName || detail.setSku}
                </div>
                {detail.setName && (
                  <div className="font-mono text-[10px] text-gray-400 leading-tight">{detail.setSku}</div>
                )}
              </td>
              <td
                className={`py-1 pr-3 text-right font-semibold whitespace-nowrap ${
                  detail.signedQuantity > 0 ? 'text-blue-600' : 'text-red-600'
                }`}
              >
                {signed}
              </td>
              <td className="py-1 text-center whitespace-nowrap">
                <StockBadge variant={detail.storage} size="9px" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Дві половини колонки МС | ГП з роздільником. */
function DualStockCell({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <div className="flex-1 flex items-center justify-end text-gray-500 min-w-0">{left}</div>
      <div className="w-px h-3 bg-gray-400" aria-hidden="true" />
      <div className="flex-1 flex items-center justify-start text-gray-500 min-w-0">{right}</div>
    </div>
  );
}

export const InventoryHistoryRow = ({
  sessionId,
  item,
  total,
  dev,
  totalGp,
  devGp,
  rowKey,
  expandedRowKey,
  rowHistoryCache,
  rowHistoryLoading,
  setCompositionBySku,
  onRowClick,
}: InventoryHistoryRowProps) => {
  const isRowExpanded = expandedRowKey === rowKey;
  const historyEntries = rowHistoryCache[item.sku];
  const isRowLoading = rowHistoryLoading === item.sku;
  const setComposition = setCompositionBySku[item.sku] ?? [];
  const isSetItem = Array.isArray(setComposition) && setComposition.length > 0;

  const handleCopyProductRow = (): void => {
    copyToClipboard(
      buildProductCopyRowText(item.sku, item.name, dev, devGp),
      'Рядок даних',
    );
  };

  return (
    <Fragment>
      <tr
        className="[&>td]:border-b [&>td]:border-b-gray-100 [&>td]:text-gray-700 [&>td]:transition-colors hover:bg-gray-100/80 cursor-pointer select-none"
        onClick={() => onRowClick(sessionId, item.sku)}
      >
        <td className="py-2 px-3 font-mono">
          <div className="flex items-center gap-1">
            <DynamicIcon
              name="chevron-right"
              className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isRowExpanded ? 'rotate-90' : ''}`}
            />
            <div onClick={(event) => event.stopPropagation()}>
              <Dropdown placement="bottom-start">
                <DropdownTrigger>
                  <button
                    type="button"
                    className="font-mono text-left hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    {item.sku}
                  </button>
                </DropdownTrigger>
                <DropdownMenu aria-label="Копіювання даних товару">
                  <DropdownItem
                    key="sku"
                    startContent={<DynamicIcon name="copy" size={16} />}
                    onPress={() => copyToClipboard(item.sku, item.sku)}
                  >
                    SKU
                  </DropdownItem>
                  <DropdownItem
                    key="name"
                    startContent={<DynamicIcon name="copy" size={16} />}
                    onPress={() => copyToClipboard(item.name, 'Назва товару')}
                  >
                    Назва товару
                  </DropdownItem>
                  <DropdownItem
                    key="row"
                    startContent={<DynamicIcon name="copy" size={16} />}
                    onPress={handleCopyProductRow}
                  >
                    Рядок даних
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          </div>
        </td>
        <td className="py-2 px-3 ">
          <span className={`inline ${item.isOutdated ? 'text-gray-400/75' : ''}`}>
            {item.unit === 'portions' && (
              <span className="inline items-center gap-0.5 text-xs px-1 py-0.5 mr-1.5 rounded-[6px] bg-neutral-300 text-white text-shadow-sm shadow-inner">
                {item.portionsPerBox}
              </span>
            )}
            <span className="pr-1.5">{item.name}</span>
            {item.isOutdated && (
              <Tooltip content="Товар відключений в магазині" placement="top" showArrow classNames={{ base: 'before:bg-danger before:rounded-[3px]', content: 'bg-danger border-0 text-white text-xs' }}>
                <span className="inline-block text-[10px] font-medium px-1.5 py-1 mr-1 rounded-full bg-red-600 border-1 border-red-600 text-white leading-none">
                  OFF
                </span>
              </Tooltip>
            )}
            {isSetItem && (
              <Popover
                showArrow
                placement="right"
                classNames={{
                  trigger: 'inline-block w-fit font-bold text-[10px] bg-amber-400/5 text-amber-800/50 border border-amber-800/30 rounded-full uppercase px-1.5 py-1 leading-none',
                  content: 'px-4 py-3 bg-amber-100',
                  base: 'before:bg-amber-100 before:rounded-[2px] before:z-10',
                }}
              >
                <PopoverTrigger>Склад</PopoverTrigger>
                <PopoverContent>
                  {setComposition.length > 0 ? (
                    <ul className="space-y-1">
                      {setComposition.map((component, index) => (
                        <li key={`${component.sku}-${index}`} className="flex items-start">
                          {component.quantity ?? '–'} × {component.name ?? 'Без назви'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">Склад набору недоступний у цьому записі.</p>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </span>
        </td>
        <td className="py-2 px-3 text-center">{item.unit === 'portions' ? <CompactBalance total={item.systemBalance} portionsPerBox={item.portionsPerBox} /> : item.systemBalance}</td>
        <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{total === null ? '–' : (item.unit === 'portions' ? <CompactBalance total={total} portionsPerBox={item.portionsPerBox} sessionItem={item} /> : String(total))}</td>
        <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{dev === null ? '–' : (<span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>{dev > 0 ? '+' : ''} {dev}</span>)}</td>
        <td className="py-2 px-3 text-center">{item.unit === 'portions' ? <CompactBalance total={item.systemBalanceGp} portionsPerBox={item.portionsPerBox} /> : (item.systemBalanceGp ?? '–')}</td>
        <td className={`py-2 px-3 text-center ${totalGp === null ? 'text-gray-300' : ''}`}>{totalGp === null ? '–' : (item.unit === 'portions' ? <CompactBalance total={totalGp} portionsPerBox={item.portionsPerBox} sessionItem={{ boxCount: item.boxCountGp, actualCount: item.actualCountGp }} /> : String(totalGp))}</td>
        <td className={`py-2 px-3 text-center ${devGp === null ? 'text-gray-300' : ''}`}>{devGp === null ? '–' : (<span className={`font-semibold ${devGp === 0 ? 'text-green-600' : devGp < 0 ? 'text-red-500' : 'text-blue-600'}`}>{devGp > 0 ? '+' : ''} {devGp}</span>)}</td>
      </tr>
      {isRowExpanded && (
        <tr>
          <td colSpan={8} className="p-0 bg-gray-100 border-b border-gray-200/40 shadow-[inset_0_6px_10px_rgba(0,0,0,0.05)]">
            <div className="px-2 py-4">
              {isRowLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500">
                  <DynamicIcon name="loader-2" className="w-3 h-3 animate-spin" />
                  Завантаження...
                </div>
              ) : !historyEntries || historyEntries.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">Немає даних інвентаризацій за останні 30 днів</p>
              ) : (
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-200 [&>th]:text-center [&>th]:py-1 [&>th]:px-2 [&>th]:font-semibold [&>th]:w-1/10">
                      <th className="text-left! w-auto! min-w-[160px]">Дата</th>
                      <th>Переміщення
                        <div className="flex items-center justify-center gap-1">
                          <StockBadge variant="ms" size="9px" />
                          <span className="text-[9px] text-gray-400">|</span>
                          <StockBadge variant="gp" size="9px" />
                        </div>
                      </th>
                      <th>Відвантаження <br/><StockBadge variant="ms" size="9px" /></th>
                      <th>Комплектування
                        <div className="flex items-center justify-center gap-1">
                          <StockBadge variant="ms" size="9px" />
                          <span className="text-[9px] text-gray-400">|</span>
                          <StockBadge variant="gp" size="9px" />
                        </div>
                      </th>
                      <th>Повернення <br/><StockBadge variant="ms" size="9px" /></th>
                      <th>Списання
                        <div className="flex items-center justify-center gap-1">
                          <StockBadge variant="ms" size="9px" />
                          <span className="text-[9px] text-gray-400">|</span>
                          <StockBadge variant="gp" size="9px" />
                        </div>
                      </th>
                      <th>Облік
                        <div className="flex items-center justify-center gap-1">
                          <StockBadge variant="ms" size="9px" />
                          <span className="text-[9px] text-gray-400">|</span>
                          <StockBadge variant="gp" size="9px" />
                        </div>
                      </th>
                      <th>Факт
                        <div className="flex items-center justify-center gap-1">
                          <StockBadge variant="ms" size="9px" />
                          <span className="text-[9px] text-gray-400">|</span>
                          <StockBadge variant="gp" size="9px" />
                        </div>
                      </th>
                      <th>Відхилення
                        <div className="flex items-center justify-center gap-1">
                          <StockBadge variant="ms" size="9px" />
                          <span className="text-[9px] text-gray-400">|</span>
                          <StockBadge variant="gp" size="9px" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {historyEntries.map((entry) => (
                      <tr key={entry.sessionId} className="tabular-nums text-gray-600 hover:bg-white/40">
                        {/* Дата */}
                        <td className="py-0.5 px-2">{formatRelativeDate(entry.date, { showTime: true, maxRelativeDays:21, maxRelativeHours: 3, includeWeekdays: true, shortWeekday: true })}</td>
                        {/* Переміщення МС / ГП */}
                        <td className="py-0.5 px-2 text-center text-gray-400">
                          <DualStockCell
                            left={renderSignedValue(entry.moved)}
                            right={renderSignedValue(entry.movedGp)}
                          />
                        </td>
                        {/* Відвантаження */}
                        <td className="py-0.5 px-2 text-center text-gray-400">
                          {entry.shipped == null || entry.shipped === 0 ? '–' : (
                            <span className="text-red-600 font-medium">-{Math.abs(entry.shipped)}</span>
                          )}
                        </td>
                        {/* Комплектування МС / ГП */}
                        <td className="py-0.5 px-2 text-center text-gray-400">
                          {entry.kitDetails && entry.kitDetails.length > 0 ? (
                            <Tooltip
                              content={renderKitDetailsTooltip(entry.kitDetails)}
                              showArrow
                              placement="top"
                              classNames={historyTooltipClassNames}
                            >
                              <span className="inline-flex cursor-help">
                                <DualStockCell
                                  left={renderSignedValue(entry.kit)}
                                  right={renderSignedValue(entry.kitGp)}
                                />
                              </span>
                            </Tooltip>
                          ) : (
                            <DualStockCell
                              left={renderSignedValue(entry.kit)}
                              right={renderSignedValue(entry.kitGp)}
                            />
                          )}
                        </td>
                        {/* Повернення — завжди МС */}
                        <td className="py-0.5 px-2 text-center text-gray-400">
                          {renderPositiveValue(entry.returned)}
                        </td>
                        {/* Списання МС / ГП */}
                        <td className="py-0.5 px-2 text-center text-gray-400">
                          <DualStockCell
                            left={renderNegativeValue(entry.writtenOff)}
                            right={renderNegativeValue(entry.writtenOffGp)}
                          />
                        </td>
                        {/* Облік МС / ГП */}
                        <td className="py-0.5 px-2 text-center">
                          <DualStockCell
                            left={entry.systemBalance ?? '–'}
                            right={entry.systemBalanceGp ?? '–'}
                          />
                        </td>
                        {/* Факт МС / ГП */}
                        <td className="py-0.5 px-2 text-center">
                          <DualStockCell
                            left={entry.actual ?? '–'}
                            right={entry.actualGp ?? '–'}
                          />
                        </td>
                        {/* Відхилення МС / ГП */}
                        <td className="py-0.5 px-2 text-center">
                          <DualStockCell
                            left={
                              entry.deviation === null ? '–' : (
                                <span className={`font-semibold ${entry.deviation === 0 ? 'text-green-600' : entry.deviation < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                  {entry.deviation > 0 ? '+' : ''}{entry.deviation}
                                </span>
                              )
                            }
                            right={
                              entry.deviationGp == null ? '–' : (
                                <span className={`font-semibold ${entry.deviationGp === 0 ? 'text-green-600' : entry.deviationGp < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                  {entry.deviationGp > 0 ? '+' : ''}{entry.deviationGp}
                                </span>
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
};

export default InventoryHistoryRow;
