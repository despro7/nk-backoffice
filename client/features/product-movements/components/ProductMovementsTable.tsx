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
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ProductMovementsGroup, ProductMovementsQueryResponse } from '../types';
import { formatGroupDisplayLabel, formatQty } from '../productMovementsUtils';
import { resolveDocumentIconClass, resolveDocumentIconName } from '../productMovementsDocumentIcon';

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

  return (
    <Accordion variant="shadow">
      <AccordionItem
        key="old-batches"
        aria-label="Старі партії"
        title={`Партії без рухів за обраний період (${groups.length})`}
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
  const groupTitle = formatGroupDisplayLabel(group.label);

  const tableRows: TableRowItem[] = [
    ...group.lines.map((line) => ({ ...line, kind: 'line' as const })),
    {
      kind: 'summary',
      key: `${group.groupKey}-summary`,
      documentLabel: 'Разом',
      receiptQty: group.totals.receiptQty,
      expenseQty: group.totals.expenseQty,
      balanceQty: group.totals.balanceQty,
    },
  ];

  return (
    <div className={`min-w-0 rounded-xl bg-default-50 ${compact ? '' : 'p-2'}`}>
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
            table: 'min-w-[640px] md:min-w-[720px]',
            thead: 'md:sticky md:top-[2.375rem] md:z-20',
            th: 'bg-default-100 text-default-500 text-xs font-medium whitespace-nowrap first:rounded-tl-none first:rounded-bl-md last:rounded-tr-none last:rounded-br-md',
            td: 'text-sm',
          }}
        >
          <TableHeader>
            <TableColumn className="w-12">№</TableColumn>
            <TableColumn className="w-28">Дата</TableColumn>
            <TableColumn>Документ</TableColumn>
            <TableColumn className="w-28 text-right">Надходження</TableColumn>
            <TableColumn className="w-28 text-right">Витрата</TableColumn>
            <TableColumn className="w-28 text-right">Залишок</TableColumn>
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
                  <TableCell className={isSummary ? '' : 'text-default-500'}>
                    {isSummary ? '' : line.rowNum}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {isSummary ? '' : line.date}
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    <div className="flex items-center gap-2">
                      {iconName ? (
                        <DynamicIcon name={iconName as any} size={15} className={`shrink-0 ${iconClass}`} />
                      ) : null}
                      <span>{line.documentLabel}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatQty(line.receiptQty) || ''}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatQty(line.expenseQty) || ''}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${line.balanceQty < 0 ? 'text-danger' : ''}`}>
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
    <div className={`flex flex-col gap-4 min-w-0 ${compact ? '' : ''}`}>
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
