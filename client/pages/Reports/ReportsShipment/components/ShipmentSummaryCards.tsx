import React from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Spinner } from '@heroui/react';
import type { ShipmentSummary } from '../ReportsShipmentTypes';

interface ShipmentSummaryCardsProps {
  summary: ShipmentSummary | null;
  loading?: boolean;
  className?: string;
}

interface StatCardProps {
  label: string;
  value: number | string;
  subLabel: string;
  iconName: string;
  iconColor: string;
  loading?: boolean;
}

function StatCard({ label, value, subLabel, iconName, iconColor, loading }: StatCardProps) {
  return (
    <div className="bg-white flex flex-col gap-2 p-4 rounded-xl shadow-sm flex-1">
      <div className="flex items-center gap-2 justify-between">
        <span className="text-sm font-medium leading-tight text-[#1e1b1b]">{label}</span>
        <DynamicIcon name={iconName as any} style={{ color: iconColor }} className="shrink-0 size-6 sm:size-5" />
      </div>
      <div className="flex items-end gap-1.5">
        {loading ? (
          <Spinner size="sm" color="primary" />
        ) : (
          <span className="text-xl sm:text-[32px] font-semibold text-[#1e1b1b] leading-none">{value}</span>
        )}
      </div>
      <p className="text-xs text-[#a5a5a5]">{subLabel}</p>
    </div>
  );
}

export default function ShipmentSummaryCards({ summary, loading, className }: ShipmentSummaryCardsProps) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5 px-3 md:px-0 ${className ?? ''}`}>
      <StatCard
        label="Відвантажені замовлення"
        iconName="receipt-text"
        iconColor="#4083e1"
        value={summary?.totalOrders ?? 0}
        subLabel="Кількість відвантажених замовлень"
        loading={loading}
      />
      <StatCard
        label="Відвантажені порції"
        iconName="paper-bag"
        iconColor="#38b351"
        value={`${summary?.regularPortions ?? 0} / ${summary?.totalPortions ?? 0}`}
        subLabel="Звичайні порції / усі порції"
        loading={loading}
      />
      <StatCard
        label="Відвантажені набори"
        iconName="package"
        iconColor="#8b5cf6"
        value={`${summary?.shippedSetsCount ?? 0} / ${summary?.shippedSetPortions ?? 0}`}
        subLabel="Кількість наборів / порцій у наборах"
        loading={loading}
      />
      <StatCard
        label="Унікальні товари і&nbsp;набори"
        iconName="shopping-basket"
        iconColor="#f64c15"
        value={summary?.uniqueProducts ?? 0}
        subLabel="Кількість унікальних позицій"
        loading={loading}
      />
    </div>
  );
}
