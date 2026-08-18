import {
  Button,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Skeleton,
} from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  LAL_EXPORT_COLUMN_OPTIONS,
  type LalAudienceSummary,
  type LalExportColumn,
  type LalExportFormat,
} from '@shared/types/lalAudiences';
import { formatNumber } from '@/lib/formatUtils';
import { qualityColor, qualityLabel } from '../LalAudiencesUtils';

interface LalSummaryCardProps {
  exportColumns: Set<LalExportColumn>;
  isExporting: boolean;
  loading: boolean;
  summary: LalAudienceSummary | null;
  onExport: (format: LalExportFormat) => void;
  onExportColumnsChange: (columns: Set<LalExportColumn>) => void;
}

export default function LalSummaryCard({
  exportColumns,
  isExporting,
  loading,
  summary,
  onExport,
  onExportColumnsChange,
}: LalSummaryCardProps) {
  const phonePercent = summary?.phonePercent ?? 100;
  const emailPercent = summary?.emailPercent ?? 0;
  const quality = summary?.quality ?? 'low';

  const handleColumnsChange = (keys: SharedSelection) => {
    if (keys === 'all') {
      onExportColumnsChange(new Set(LAL_EXPORT_COLUMN_OPTIONS.map((option) => option.key)));
      return;
    }
    const next = new Set<LalExportColumn>();
    for (const key of keys) {
      if (LAL_EXPORT_COLUMN_OPTIONS.some((option) => option.key === key)) {
        next.add(key as LalExportColumn);
      }
    }
    if (next.size > 0) {
      onExportColumnsChange(next);
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap gap-8">
        <div className="flex flex-col justify-between">
          <p className="text-xs text-default-400 mb-1">Клієнтів у вибірці</p>
          {loading ? (
            <Skeleton className="rounded h-6 w-20 opacity-60" />
          ) : (
            <p className="text-2xl font-semibold text-default-800 leading-none">
              {formatNumber(summary?.customers ?? 0)}
            </p>
          )}
        </div>
        <div className="flex flex-col justify-between">
          <p className="text-xs text-default-400 mb-1">Телефон / email</p>
          {loading ? (
            <Skeleton className="rounded h-5 w-20 opacity-60" />
          ) : (
            <p className="text-sm text-default-700 py-0.5">
              {phonePercent.toFixed(0)}% / {emailPercent.toFixed(0)}%
            </p>
          )}
        </div>
        <div className="flex flex-col justify-between">
          <p className="text-xs text-default-400 mb-1">Якість</p>
          {loading ? (
            <Skeleton className="rounded h-5 w-15 opacity-60" />
          ) : (
            <Chip size="sm" color={qualityColor(quality)} variant="flat">
              {qualityLabel(quality)}
            </Chip>
          )}
        </div>
        <div className="flex flex-col justify-between">
          <p className="text-xs text-default-400 mb-1">Замовлень у вибірці</p>
          {loading ? (
            <Skeleton className="rounded h-5 w-16 opacity-60" />
          ) : (
            <p className="text-sm text-default-700 py-0.5">{formatNumber(summary?.totalOrdersInSelection ?? 0)}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <Button
              isIconOnly
              variant="flat"
              aria-label="Колонки експорту"
              title="Колонки експорту"
            >
              <DynamicIcon name="settings-2" size={16} />
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Колонки експорту"
            closeOnSelect={false}
            selectionMode="multiple"
            selectedKeys={exportColumns}
            onSelectionChange={handleColumnsChange}
          >
            {LAL_EXPORT_COLUMN_OPTIONS.map((option) => (
              <DropdownItem key={option.key}>{option.label}</DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>

        <Dropdown>
          <DropdownTrigger>
            <Button
              color="primary"
              isLoading={isExporting}
              isDisabled={loading || isExporting || (summary?.customers ?? 0) <= 0}
              startContent={!isExporting ? <DynamicIcon name="download" size={16} /> : undefined}
            >
              Експорт
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Формат експорту"
            onAction={(key) => {
              if (key === 'csv' || key === 'xlsx') {
                onExport(key);
              }
            }}
          >
            <DropdownItem key="csv">CSV</DropdownItem>
            <DropdownItem key="xlsx">XLSX</DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );
}
