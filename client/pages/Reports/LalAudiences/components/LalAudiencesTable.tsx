import {
  Checkbox,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import type { LalAudiencePagination, LalAudienceRow } from '@shared/types/lalAudiences';
import { LAL_PAGE_SIZE_OPTIONS } from '@shared/types/lalAudiences';
import { formatNumber, formatPrice } from '@/lib/formatUtils';
import { ReportLoadingOverlay } from '../../shared/ReportLoadingOverlay';
import { ReportTableEmptyState } from '../../shared/ReportTableEmptyState';

const COLUMNS = [
  { key: 'include', label: '' },
  { key: 'name', label: 'ПІБ' },
  { key: 'phone', label: 'Телефон' },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'Місто' },
  { key: 'orders', label: 'Замовлень' },
  { key: 'ltv', label: 'LTV' },
  { key: 'lastOrder', label: 'Останнє замовлення' },
] as const;

interface LalAudiencesTableProps {
  excludedPhones: Set<string>;
  limit: number;
  loading: boolean;
  page: number;
  pagination: LalAudiencePagination | null;
  rows: LalAudienceRow[];
  onLimitChange: (limit: number) => void;
  onPageChange: (page: number) => void;
  onRowIncludedChange: (phone: string, included: boolean) => void;
}

function formatLastOrderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  return date.toLocaleDateString('uk-UA');
}

export default function LalAudiencesTable({
  excludedPhones,
  limit,
  loading,
  page,
  pagination,
  rows,
  onLimitChange,
  onPageChange,
  onRowIncludedChange,
}: LalAudiencesTableProps) {
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);

  return (
    <div className="bg-white rounded-xl p-4 flex flex-col gap-4">
      <div className="relative">
        <Table
          aria-label="LAL аудиторія"
          classNames={{
            wrapper: 'min-h-80 p-0 pb-1 shadow-none bg-transparent rounded-none',
            th: 'bg-default-200/60 first:rounded-s-sm last:rounded-e-sm',
            td: 'py-2 text-default-700',
          }}
        >
          <TableHeader>
            {COLUMNS.map((column) => (
              <TableColumn key={column.key}>{column.label}</TableColumn>
            ))}
          </TableHeader>
          <TableBody
            items={rows}
            emptyContent={
              <ReportTableEmptyState
                loading={loading && rows.length === 0}
                emptyIconName="users"
                emptyMessage="Немає клієнтів за обраними фільтрами"
              />
            }
          >
            {(row) => (
              <TableRow key={row.phone}>
                <TableCell>
                  <Checkbox
                    size="sm"
                    aria-label={`Включити ${row.phone}`}
                    isSelected={!excludedPhones.has(row.phone)}
                    onValueChange={(selected) => onRowIncludedChange(row.phone, selected)}
                  />
                </TableCell>
                <TableCell>
                  {[row.lastName, row.firstName].filter(Boolean).join(' ') || '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.phone}</TableCell>
                <TableCell>{row.email || '—'}</TableCell>
                <TableCell>{row.city || '—'}</TableCell>
                <TableCell>{formatNumber(row.orderCount)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatPrice(row.ltv)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatLastOrderDate(row.lastOrderDate)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <ReportLoadingOverlay loading={loading && rows.length > 0} />
      </div>

      {pagination && pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-default-500">На сторінці</label>
            <Select
              aria-label="Розмір сторінки"
              size="sm"
              className="w-24"
              selectedKeys={[String(limit)]}
              onSelectionChange={(keys) => {
                const value = Number(Array.from(keys)[0]);
                if (LAL_PAGE_SIZE_OPTIONS.includes(value as (typeof LAL_PAGE_SIZE_OPTIONS)[number])) {
                  onLimitChange(value);
                }
              }}
            >
              {LAL_PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={String(option)}>{String(option)}</SelectItem>
              ))}
            </Select>
          </div>

          <Pagination
            total={totalPages}
            page={page}
            onChange={onPageChange}
            showControls
            showShadow
            classNames={{
              cursor: 'bg-neutral-500 text-white',
              item: 'cursor-pointer',
              next: 'cursor-pointer',
              prev: 'cursor-pointer',
            }}
          />

          <p className="text-sm text-default-400 min-w-24 text-right">
            {formatNumber(pagination.total)} клієнтів
          </p>
        </div>
      )}
    </div>
  );
}
