import React from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Spinner } from '@heroui/react';

export interface ShipmentSummary {
  /** Загальна кількість відправлених замовлень за обраний період */
  totalOrders: number;
  /** Загальна кількість відправлених порцій за обраний період */
  totalPortions: number;
  /** Кількість унікальних товарів у відправленнях */
  uniqueProducts: number;
}

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
    <div className="bg-white flex flex-col gap-2 p-4 rounded-xl shadow-sm min-w-[180px] flex-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#1e1b1b]">{label}</span>
        <DynamicIcon name={iconName as any} size={20} style={{ color: iconColor }} />
      </div>
      <div className="flex items-end gap-1.5">
        {loading ? (
          <Spinner size="sm" color="primary" />
        ) : (
          <span className="text-[32px] font-semibold text-[#1e1b1b] leading-none">{value}</span>
        )}
      </div>
      <p className="text-xs text-[#a5a5a5]">{subLabel}</p>
    </div>
  );
}

export default function ShipmentSummaryCards({ summary, loading, className }: ShipmentSummaryCardsProps) {
  return (
    <div className={`flex flex-wrap gap-5 ${className ?? ''}`}>
      <StatCard
        label="Замовлення"
        iconName="package"
        iconColor="#4083e1"
        value={summary?.totalOrders ?? 0}
        subLabel="Загальна кількість замовлень"
        loading={loading}
      />
      <StatCard
        label="Відвантажені порції"
        iconName="utensils"
        iconColor="#38b351"
        value={summary?.totalPortions ?? 0}
        subLabel="Загальна кількість порцій"
        loading={loading}
      />
      <StatCard
        label="Унікальні товари"
        iconName="shopping-basket"
        iconColor="#f64c15"
        value={summary?.uniqueProducts ?? 0}
        subLabel="Кількість унікальних позицій"
        loading={loading}
      />
    </div>
  );
}
