import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import type { ProductMovementsGrandTotals } from '../productMovementsUtils';
import { formatQty } from '../productMovementsUtils';

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
}

function StatCard({ label, value, iconName, iconColor, valueClassName }: StatCardProps) {
  return (
    <div className="flex flex-1 min-w-0 flex-col gap-1 rounded-lg bg-content1 px-2.5 py-2 shadow-sm border border-default-100">
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
        {value}
      </span>
    </div>
  );
}

export default function ProductMovementsSummaryCards({
  totals,
  className,
}: ProductMovementsSummaryCardsProps) {
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0 flex-1', className)}>
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
