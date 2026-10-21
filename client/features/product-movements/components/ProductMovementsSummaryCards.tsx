import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import type { ProductMovementsGrandTotals } from '../productMovementsUtils';
import { formatQty } from '../productMovementsUtils';
import { Tooltip } from '@heroui/react';

interface ProductMovementsSummaryCardsProps {
  totals: ProductMovementsGrandTotals;
  className?: string;
}

interface StatCardProps {
  label: string;
  value: string;
  iconName: string;
  iconColor: string;
  valueClassName?: string;
  tooltipContent?: string;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  tooltipOffset?: number;
  tooltipDelay?: number;
  tooltipShowArrow?: boolean;
  tooltipClassNames?: {
    base?: string;
    content?: string;
  };
}

function StatCard({ label, value, iconName, iconColor, valueClassName, tooltipContent, tooltipPlacement, tooltipOffset, tooltipDelay, tooltipShowArrow, tooltipClassNames }: StatCardProps) {
  return (
    <div className="flex flex-1 min-w-0 flex-col gap-1 rounded-md bg-white px-2.5 py-2 border border-default-200">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[11px] font-medium leading-tight text-default-600 truncate">{label}</span>
        <DynamicIcon
          name={iconName as 'package'}
          size={14}
          style={{ color: iconColor }}
          className="shrink-0"
        />
      </div>
      <span className={cn('font-mono text-lg font-semibold leading-none tabular-nums text-foreground', valueClassName)}>
        {tooltipContent ? (
        <Tooltip
          placement={tooltipPlacement ?? 'top'}
          offset={tooltipOffset ?? 10}
          content={tooltipContent ?? ''}
          delay={tooltipDelay ?? 200}
          showArrow={tooltipShowArrow ?? true}
          classNames={tooltipClassNames ?? { base: 'before:bg-white before:rounded-[2px] before:z-[10] before:shadow-[1px_1px_1px_rgba(0,0,0,0.08)]', content: 'rounded-sm text-xs bg-white border-0 text-gray-700' }}
        >
          {value}
        </Tooltip>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

export default function ProductMovementsSummaryCards({
  totals,
  className,
}: ProductMovementsSummaryCardsProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-2 min-w-0 flex-1 [&>*]:min-w-36', className)}>
      <StatCard
        label="Партії"
        iconName="layers"
        iconColor="#8b5cf6"
        value={`${totals.batchesTotal} / ${totals.batchesWithoutMovements}`}
        tooltipContent="Всього / партії без руху"
        tooltipPlacement="top"
        tooltipOffset={20}
        tooltipDelay={200}
        tooltipShowArrow={true}
        tooltipClassNames={{ 
          base: 'before:bg-white before:rounded-[2px] before:z-[10] before:shadow-[1px_1px_1px_rgba(0,0,0,0.08)]',
          content: 'rounded-sm text-xs bg-white border-0 text-gray-700'
        }}
      />
      <StatCard
        label="Початковий залишок"
        iconName="warehouse"
        iconColor="#64748b"
        value={formatQty(totals.openingBalance) || '0'}
      />
      <StatCard
        label="Надходження"
        iconName="arrow-down-to-line"
        iconColor="#38b351"
        value={formatQty(totals.receiptQty) || '0'}
      />
      <StatCard
        label="Витрата"
        iconName="arrow-up-from-line"
        iconColor="#f64c15"
        value={formatQty(totals.expenseQty) || '0'}
      />
      <StatCard
        label="Залишок"
        iconName="scale"
        iconColor={totals.balanceQty < 0 ? '#ef4444' : '#4083e1'}
        value={formatQty(totals.balanceQty) || '0'}
        valueClassName={totals.balanceQty < 0 ? 'text-danger' : undefined}
      />
    </div>
  );
}
