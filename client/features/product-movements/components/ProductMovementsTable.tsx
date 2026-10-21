import {
  Accordion,
  AccordionItem,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ProductMovementsGroup, ProductMovementsQueryResponse } from '../types';
import { formatGroupDisplayLabel, formatQty } from '../productMovementsUtils';
import { resolveDocumentIconClass, resolveDocumentIconName } from '../productMovementsDocumentIcon';
import { useWarehouseDocumentEditDrawer } from '@/features/warehouse-document-edit/context/WarehouseDocumentEditDrawerContext';

interface ProductMovementsTableProps {
  result: ProductMovementsQueryResponse | null;
  loading: boolean;
  hasGenerated: boolean;
  compact?: boolean;
}

type TableRowItem =
  | (ProductMovementsGroup['lines'][number] & { kind: 'line' })
  | {
    kind: 'summary';
    key: string;
    documentLabel: string;
    receiptQty: number;
    expenseQty: number;
    balanceQty: number;
  };

function OldBatchRow({ group }: { group: ProductMovementsGroup }) {
  const groupTitle = formatGroupDisplayLabel(group.label);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-default-200/75 px-1 py-2 last:border-b-0">
      <div className="text-sm text-default-600">{groupTitle}</div>
      <div className="text-xs text-default-600 font-semibold font-mono">
        {formatQty(group.openingBalance) || '0'}
      </div>
    </div>
  );
}

function OldBatchesAccordion({ groups }: { groups: ProductMovementsGroup[] }) {
  if (groups.length === 0) return null;

  const totalOldBatchQty = groups.reduce((acc, group) => acc + group.openingBalance, 0);

  return (
    <Accordion variant="shadow">
      <AccordionItem
        key="old-batches"
        aria-label="Старі партії"
        title={
          <>
            Партії без рухів за обраний період ({groups.length})<span className="font-normal mx-3 text-default-300">|</span><span className="font-normal">Залишок:{' '}
            {totalOldBatchQty < 0 ? (
              <span className="text-danger">{formatQty(totalOldBatchQty)}</span>
            ) : (
              formatQty(totalOldBatchQty) || '0'
            )}
            </span>
          </>
        }
        startContent={<DynamicIcon name="archive" size={18} className="text-default-400" />}
        classNames={{
          title: 'text-sm font-semibold',
          content: 'pt-0',
        }}
      >
        <div className="flex flex-col">
          {groups.map((group) => (
            <OldBatchRow key={group.groupKey} group={group} />
          ))}
        </div>
      </AccordionItem>
    </Accordion>
  );
}

function GroupBlock({ group, compact = false }: { group: ProductMovementsGroup; compact?: boolean }) {
  const { open: openDocumentEdit } = useWarehouseDocumentEditDrawer();
  const groupTitle = formatGroupDisplayLabel(group.label);

  const tableRows: TableRowItem[] = [
    ...group.lines.map((line) => ({ ...line, kind: 'line' as const })),
    {
      kind: 'summary',
      key: `${group.groupKey}-summary`,
      documentLabel: '',
      receiptQty: group.totals.receiptQty,
      expenseQty: group.totals.expenseQty,
      balanceQty: group.totals.balanceQty,
    },
  ];

  return (
    <div className={`min-w-144 w-full rounded-xl ${compact ? '' : 'p-2'}`}>
      <div className="flex min-h-[2.375rem] flex-wrap items-center justify-between gap-2 border-b border-default-200/75 ring-1 ring-default-100 bg-default-100 px-2 py-2 rounded-t-md md:sticky md:top-0 md:z-30">
        <div className="text-sm font-semibold text-foreground">{groupTitle}</div>
        <div className="text-xs text-default-500">
          Початковий залишок: <span className="font-mono">{formatQty(group.openingBalance) || '0'}</span>
        </div>
      </div>

      <div className="-mx-px overflow-x-auto md:overflow-x-visible">
        <Table
          aria-label={group.label}
          removeWrapper
          classNames={{
            base: 'gap-0 min-w-0',
            table: 'min-w-[560px]',
            thead: 'md:sticky md:top-[2.375rem] md:z-20',
            th: 'bg-default-100 text-default-500 text-xs font-medium whitespace-nowrap first:rounded-tl-none first:rounded-bl-md last:rounded-tr-none last:rounded-br-md',
            td: 'text-sm px-1.5',
          }}
        >
          <TableHeader>
            <TableColumn className="w-8 hidden md:table-cell">№</TableColumn>
            <TableColumn className="min-w-24 w-auto max-w-26 rounded-bl-md md:rounded-none">Дата</TableColumn>
            <TableColumn>Документ</TableColumn>
            <TableColumn className="w-20 text-center truncate text-nowrap">Надходж.</TableColumn>
            <TableColumn className="w-20 text-center truncate text-nowrap">Витрата</TableColumn>
            <TableColumn className="w-20 text-center truncate text-nowrap">Залишок</TableColumn>
          </TableHeader>
          <TableBody
            items={tableRows}
            emptyContent="Рухів за період немає"
          >
            {(line) => {
              const isSummary = line.kind === 'summary';
              const iconName = isSummary ? null : resolveDocumentIconName(line.documentLabel);
              const iconClass = iconName ? resolveDocumentIconClass(line.documentLabel) : '';

              return (
                <TableRow
                  key={isSummary
                    ? line.key
                    : `${group.groupKey}-${line.rowNum}-${line.date}-${line.documentLabel}`}
                  className={`${isSummary ? 'bg-default-200/50 [&>td]:font-semibold' : 'hover:bg-default-100/60'} [&>td:first-child]:rounded-s-md [&>td:last-child]:rounded-e-md`}
                >
                  <TableCell className={`hidden md:table-cell ${isSummary ? '' : 'text-default-500 text-center'}`}>
                    {isSummary ? '' : line.rowNum}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {isSummary ? 'Разом' : (
                      <Tooltip
                        placement="top"
                        content={line.dateTime || line.date}
                        delay={200}
                        showArrow
                        classNames={{ 
                          base: 'before:bg-white before:rounded-[2px] before:z-[10] before:shadow-[1px_1px_1px_rgba(0,0,0,0.08)]',
                          content: 'rounded-sm text-xs bg-white border-0 text-gray-700'
                        }}
                      >
                        <span className="cursor-help">{line.date}</span>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="min-w-40 max-w-0 px-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {iconName ? (
                        <DynamicIcon name={iconName as any} size={15} className={`shrink-0 ${iconClass}`} />
                      ) : null}
                      {!isSummary && line.kind === 'line' && line.documentId ? (
                        <button
                          type="button"
                          className="text-left min-w-0 max-w-full truncate text-primary hover:underline focus:outline-none focus-visible:underline"
                          style={{ minWidth: 0 }}
                          onClick={() => {
                            openDocumentEdit({
                              dilovodDocumentId: line.documentId!,
                              documentLabel: line.documentLabel,
                            });
                          }}
                        >
                          <span className="block min-w-0 max-w-full truncate">{line.documentLabel}</span>
                        </button>
                      ) : (
                        <span className="block min-w-0 max-w-full truncate">{line.documentLabel}</span>
                      )}
                    </div>
                  </TableCell>
             
                  <TableCell className="text-center font-mono">
                    {formatQty(line.receiptQty) || ''}
                  </TableCell>
                  <TableCell className="text-center font-mono">
                    {formatQty(line.expenseQty) || ''}
                  </TableCell>
                  <TableCell className={`text-center font-mono ${line.balanceQty < 0 ? 'text-danger' : ''}`}>
                    {formatQty(line.balanceQty) || '0'}
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function ProductMovementsTable({
  result,
  loading,
  hasGenerated,
  compact = false,
}: ProductMovementsTableProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? 'py-10' : 'py-16'}`}>
        <Spinner label="Формування рухів..." />
      </div>
    );
  }

  if (!hasGenerated) {
    return (
      <div className={`flex items-center justify-center text-default-400 ${compact ? 'py-10' : 'py-16'}`}>
        Оберіть товар і натисніть «Сформувати»
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const oldBatchGroups = result.groups.filter((group) => group.lines.length === 0);
  const movementGroups = result.groups.filter((group) => group.lines.length > 0);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {result.warning ? (
        <div className="text-sm text-warning">{result.warning}</div>
      ) : null}
      <OldBatchesAccordion groups={oldBatchGroups} />
      {movementGroups.map((group) => (
        <GroupBlock key={group.groupKey} group={group} compact={compact} />
      ))}
    </div>
  );
}
