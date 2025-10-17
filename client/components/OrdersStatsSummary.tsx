import React from "react";

interface OrdersStats {
  total: number;
  new: number;
  confirmed: number;
  readyToShip: number;
  shipped: number;
  sold: number;
  rejected: number;
  returned: number;
  deleted: number;
}

interface OrdersStatsSummaryProps {
  stats: OrdersStats;
}

const statsConfig = [
  { key: "total", label: "Всього замовлень" },
  { key: "new", label: "Нові" },
  { key: "confirmed", label: "Підтверджені" },
  { key: "readyToShip", label: "Готові до відправки" },
  { key: "shipped", label: "Відправлені" },
  { key: "sold", label: "Продажі" },
  { key: "rejected", label: "Відхилені" },
  { key: "returned", label: "Повернені" },
  { key: "deleted", label: "Видалені" },
];

export default function OrdersStatsSummary({ stats }: OrdersStatsSummaryProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {statsConfig.map(({ key, label }) => (
        <div
          key={key}
          className="flex flex-col justify-center p-6 bg-white rounded-md border border-neutral-200"
        >
          <span className="text-3xl font-extrabold mb-1 tracking-tight text-neutral-700">
            {stats[key as keyof OrdersStats]}
          </span>
          <span className="text-sm text-neutral-500 mt-1 leading-tight">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
