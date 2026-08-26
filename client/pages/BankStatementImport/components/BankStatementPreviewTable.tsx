import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Checkbox,
  Input,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Tabs, Tab } from '@heroui/tabs';
import type { BankStatementDirection, BankStatementInlineColumn, BankStatementRow } from '@shared/types/bankStatement';
import { useTableSelection } from '@/hooks/useTableSelection';
import { IconActionButton } from '@/components/table/IconActionButton';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { findDilovodItemLabel } from '@shared/utils/directoryUtils';
import BankStatementRowEditModal from './BankStatementRowEditModal';
import { DilovodDictAutocomplete } from './DilovodDictAutocomplete';
import { DilovodDictSelect } from './DilovodDictSelect';

export interface BankStatementPreviewTableProps {
  rows: BankStatementRow[];
  filter: BankStatementDirection;
  onFilterChange: (direction: BankStatementDirection) => void;
  onToggleDirection: (rowIndexes: number[]) => void;
  onDeleteRows: (rowIndexes: number[]) => void;
  onUpdateRow: (rowIndex: number, patch: Partial<BankStatementRow>) => void;
  payloadIds: string[];
  onPayloadIdsChange: (ids: string[]) => void;
  inlineEditColumns: BankStatementInlineColumn[];
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

const formatMoney = (n: number) =>
  n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function isoToCalendarDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function InlineText({
  value,
  onCommit,
  type = 'text',
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  type?: 'text' | 'date';
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <Input
      size="sm"
      type={type}
      variant="bordered"
      value={local}
      onValueChange={setLocal}
      onBlur={() => { if (local !== value) onCommit(local); }}
      className={className}
      classNames={{ inputWrapper: 'h-8 min-h-8' }}
    />
  );
}

function idsToIndexes(ids: string[]): number[] {
  return ids.map((id) => Number(id)).filter((n) => Number.isFinite(n));
}

export default function BankStatementPreviewTable({
  rows,
  filter,
  onFilterChange,
  onToggleDirection,
  onDeleteRows,
  onUpdateRow,
  payloadIds,
  onPayloadIdsChange,
  inlineEditColumns,
}: BankStatementPreviewTableProps) {
  const { directories, loadDirectories } = useDilovodDirectories();
  useEffect(() => {
    void loadDirectories();
  }, [loadDirectories]);

  const inlineSet = useMemo(() => new Set(inlineEditColumns), [inlineEditColumns]);
  const ledgerAccounts = useMemo(
    () => (directories?.ledgerAccounts ?? []).filter((a) => a.id),
    [directories],
  );
  const settlementsKinds = useMemo(
    () => (directories?.settlementsKinds ?? []).filter((k) => k.id),
    [directories],
  );
  const cashItems = useMemo(
    () => (directories?.cashItems ?? []).filter((item) => item.id),
    [directories],
  );

  const expenseCount = rows.filter((r) => r.direction === 'expense').length;
  const incomeCount = rows.filter((r) => r.direction === 'income').length;
  const visible = useMemo(() => rows.filter((r) => r.direction === filter), [rows, filter]);
  const visibleIds = useMemo(() => visible.map((r) => String(r.rowIndex)), [visible]);
  const allIds = useMemo(() => rows.map((r) => String(r.rowIndex)), [rows]);

  const selection = useTableSelection(visibleIds, {
    allIds,
    selectedIds: payloadIds,
    onSelectionChange: onPayloadIdsChange,
  });
  const lastModsRef = useRef({ shift: false, additive: false });
  const [editRow, setEditRow] = useState<BankStatementRow | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [pendingTransferIds, setPendingTransferIds] = useState<string[] | null>(null);

  const isExpenseTab = filter === 'expense';
  const oppositeLabel = isExpenseTab ? 'Перенести в надходження' : 'Перенести у витрати';
  const oppositeName = isExpenseTab ? 'надходження' : 'витрати';

  const requestToggle = (ids: string[]) => {
    setPendingTransferIds(ids);
  };

  const confirmToggle = () => {
    if (!pendingTransferIds) return;
    onToggleDirection(idsToIndexes(pendingTransferIds));
    setPendingTransferIds(null);
  };

  const requestDelete = (ids: string[]) => {
    setPendingDeleteIds(ids);
  };

  const confirmDelete = () => {
    if (!pendingDeleteIds) return;
    onDeleteRows(idsToIndexes(pendingDeleteIds));
    setPendingDeleteIds(null);
  };

  const openEdit = (ids: string[]) => {
    const idx = Number(ids[0]);
    const row = rows.find((r) => r.rowIndex === idx) ?? null;
    setEditRow(row);
  };

  const payloadCount = payloadIds.length;

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        aria-label="Напрям операцій"
        size="lg"
        fullWidth
        selectedKey={filter}
        onSelectionChange={(key) => onFilterChange(key as BankStatementDirection)}
        classNames={{
          base: 'mb-1',
          tabList: 'bg-gray-200/75 shadow-inner-sm',
          cursor: isExpenseTab ? 'bg-danger shadow-sm' : 'bg-success shadow-sm',
          tab: 'h-12 font-medium [&>div]:flex [&>div]:items-center [&>div]:gap-1.5',
          tabContent: 'group-data-[selected=true]:text-white',
        }}
      >
        <Tab
          key="expense"
          title={(
            <>
              <DynamicIcon name="trending-down" size={20} strokeWidth={1.5} />
              Витрати ({expenseCount})
            </>
          )}
        />
        <Tab
          key="income"
          title={(
            <>
              <DynamicIcon name="trending-up" size={20} strokeWidth={1.5} />
              Надходження ({incomeCount})
            </>
          )}
        />
      </Tabs>

      <p className="text-sm text-default-700">
        Позначені галочкою рядки будуть завантажені в Діловод ({payloadCount} з {rows.length}).
      </p>

      <Table
        aria-label="Попередній перегляд виписки"
        removeWrapper
        className="min-h-[160px]"
        classNames={{
          th: 'first:rounded-l-md last:rounded-e-md',
          td: 'py-3 align-top',
        }}
      >
        <TableHeader>
          <TableColumn key="sel" width={32} className="pr-0 min-w-8">
            <Checkbox
              aria-label="Включити всі рядки вкладки в payload"
              isSelected={selection.allSelected}
              isIndeterminate={selection.isIndeterminate}
              onValueChange={selection.toggleAll}
              size="sm"
              classNames={{ base: 'pr-0', wrapper: 'm-0' }}
            />
          </TableColumn>
          <TableColumn key="num">№</TableColumn>
          <TableColumn key="date">Дата</TableColumn>
          <TableColumn key="details">Кореспондент / Призначення / IBAN</TableColumn>
          <TableColumn key="accounts">Кор. рахунок / Вид / Стаття</TableColumn>
          <TableColumn key="actions" align="end" width={120}>Дії</TableColumn>
          <TableColumn key="amount" align="end">Сума</TableColumn>
        </TableHeader>
        <TableBody emptyContent="Немає операцій у цьому напрямку">
          {visible.map((row, index) => {
            const id = String(row.rowIndex);
            const isSelected = selection.selectedSet.has(id);
            const corLabel = findDilovodItemLabel(row.corAccount, directories?.ledgerAccounts);
            const kindLabel = findDilovodItemLabel(row.settlementsKind, directories?.settlementsKinds);
            const cashItemLabel = findDilovodItemLabel(row.cashItem, directories?.cashItems);
            return (
              <TableRow
                key={id}
                className={[
                  isSelected ? 'bg-gray-100' : '',
                  isSelected ? 'hover:bg-gray-200/60' : 'hover:bg-gray-100/60',
                  'outline-none cursor-default',
                  '[&:not(:last-child)>td]:border-b border-default-200/80',
                  '[&:first-child>td:first-child]:border-tl-md [&:first-child>td:last-child]:border-tr-md',
                  '[&:last-child>td:first-child]:rounded-bl-md [&:last-child>td:last-child]:rounded-br-md',
                ].join(' ')}
              >
                <TableCell className="px-0 min-w-9 w-9">
                  <div
                    className="flex w-full items-center justify-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      aria-label={`Включити рядок ${row.rowIndex} в payload`}
                      isSelected={isSelected}
                      onPointerDown={(e) => {
                        lastModsRef.current = {
                          shift: e.shiftKey,
                          additive: e.ctrlKey || e.metaKey,
                        };
                      }}
                      onValueChange={() => {
                        selection.toggleOne(id, index, lastModsRef.current);
                      }}
                      size="sm"
                      classNames={{ base: 'p-2 -mt-1.5 -ml-0.5', wrapper: 'm-0' }}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-gray-400 tabular-nums">
                  {inlineSet.has('operationNumber') ? (
                    <InlineText
                      value={row.operationNumber}
                      onCommit={(v) => onUpdateRow(row.rowIndex, { operationNumber: v.trim() })}
                      className="min-w-[72px]"
                    />
                  ) : (row.operationNumber || row.rowIndex)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-gray-700">
                  {inlineSet.has('date') ? (
                    <InlineText
                      type="date"
                      value={isoToCalendarDate(row.operationDate)}
                      onCommit={(v) => onUpdateRow(row.rowIndex, {
                        operationDate: v ? new Date(`${v}T12:00:00`).toISOString() : row.operationDate,
                      })}
                      className="min-w-[140px]"
                    />
                  ) : formatDate(row.operationDate)}
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <div className="flex flex-col gap-1 min-w-0">
                    {inlineSet.has('correspondentName') ? (
                      <InlineText
                        value={row.correspondentName}
                        onCommit={(v) => onUpdateRow(row.rowIndex, { correspondentName: v.trim() })}
                        className="min-w-[140px]"
                      />
                    ) : (
                      <span className="block text-gray-800 font-bold truncate" title={row.correspondentName}>
                        {row.correspondentName || '—'}
                      </span>
                    )}
                    {inlineSet.has('purpose') ? (
                      <InlineText
                        value={row.purpose}
                        onCommit={(v) => onUpdateRow(row.rowIndex, { purpose: v.trim() })}
                        className="min-w-[180px] max-w-[240px]"
                      />
                    ) : (
                      <span className="block text-sm text-gray-600 line-clamp-3 max-w-[380px]" title={row.purpose}>
                        {row.purpose || '—'}
                      </span>
                    )}
                    {inlineSet.has('iban') ? (
                      <InlineText
                        value={row.correspondentIban}
                        onCommit={(v) => onUpdateRow(row.rowIndex, { correspondentIban: v.trim() })}
                        className="min-w-[160px]"
                      />
                    ) : (
                      <span className="block mt-1 font-mono text-sm text-gray-500/60 truncate" title={row.correspondentIban}>
                        {row.correspondentIban || '—'}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[220px]" title={[corLabel, kindLabel, cashItemLabel].filter(Boolean).join(' · ')}>
                  <div className="flex flex-col gap-2 min-w-0">
                    {inlineSet.has('corAccount') ? (
                      <DilovodDictAutocomplete
                        dictItems={ledgerAccounts}
                        selectedKey={row.corAccount}
                        aria-label="Кор. рахунок"
                        variant="bordered"
                        onChange={(key) => onUpdateRow(row.rowIndex, { corAccount: key })}
                      />
                    ) : (
                      <span className="truncate block text-gray-700" title={corLabel}>
                        {row.corAccount ? corLabel : '—'}
                      </span>
                    )}
                    {inlineSet.has('settlementsKind') ? (
                      <DilovodDictAutocomplete
                        dictItems={settlementsKinds}
                        selectedKey={row.settlementsKind}
                        aria-label="Вид розрахунків"
                        variant="bordered"
                        onChange={(key) => onUpdateRow(row.rowIndex, { settlementsKind: key })}
                      />
                    ) : (
                      <span className="truncate block text-sm text-gray-600" title={kindLabel}>
                        {row.settlementsKind ? kindLabel : '—'}
                      </span>
                    )}
                    {inlineSet.has('cashItem') ? (
                      <DilovodDictSelect
                        dictItems={cashItems}
                        selectedKey={row.cashItem}
                        aria-label="Стаття руху"
                        variant="bordered"
                        onChange={(key) => onUpdateRow(row.rowIndex, { cashItem: key })}
                      />
                    ) : (
                      <span className="truncate block text-sm text-gray-600" title={cashItemLabel}>
                        {row.cashItem ? cashItemLabel : '—'}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    className="flex items-center justify-end gap-0.5"
                    data-selection-ignore
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconActionButton icon="pencil" label="Редагувати" onPress={() => openEdit([id])} />
                    <IconActionButton
                      icon="arrow-left-right"
                      label={oppositeLabel}
                      color={isExpenseTab ? 'success' : 'danger'}
                      onPress={() => requestToggle([id])}
                    />
                    <IconActionButton
                      icon="trash-2"
                      label="Видалити"
                      color="danger"
                      onPress={() => requestDelete([id])}
                    />
                  </div>
                </TableCell>
                <TableCell className="font-medium tabular-nums text-right whitespace-nowrap">
                  {inlineSet.has('amount') ? (
                    <InlineText
                      value={String(row.amount)}
                      onCommit={(v) => {
                        const parsed = Number(String(v).replace(',', '.'));
                        if (Number.isFinite(parsed)) onUpdateRow(row.rowIndex, { amount: parsed });
                      }}
                      className="min-w-[100px]"
                    />
                  ) : formatMoney(row.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <BankStatementRowEditModal
        row={editRow}
        onClose={() => setEditRow(null)}
        onSave={onUpdateRow}
      />

      <ConfirmModal
        isOpen={Boolean(pendingTransferIds)}
        title={
          pendingTransferIds && pendingTransferIds.length > 1
            ? `Перенести ${pendingTransferIds.length} рядків у ${oppositeName}?`
            : `Перенести в ${oppositeName}?`
        }
        message={
          pendingTransferIds && pendingTransferIds.length > 1
            ? `Обрані рядки змінять напрям і зникнуть з поточного списку.`
            : `Операція змінить напрям і зникне з поточного списку.`
        }
        confirmText="Перенести"
        cancelText="Скасувати"
        confirmColor={isExpenseTab ? 'success' : 'danger'}
        onConfirm={confirmToggle}
        onCancel={() => setPendingTransferIds(null)}
      />

      <ConfirmModal
        isOpen={Boolean(pendingDeleteIds)}
        title={pendingDeleteIds && pendingDeleteIds.length > 1 ? 'Видалити операції?' : 'Видалити операцію?'}
        message={
          pendingDeleteIds && pendingDeleteIds.length > 1
            ? `Обрані ${pendingDeleteIds.length} рядки буде прибрано з імпорту.`
            : 'Рядок буде прибрано з імпорту і не потрапить у Діловод.'
        }
        confirmText="Видалити"
        cancelText="Скасувати"
        confirmColor="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteIds(null)}
      />
    </div>
  );
}
