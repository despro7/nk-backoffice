import { useState } from "react";
import SalesDriveOrdersTable from "../components/SalesDriveOrdersTable";
import CashInImport from "./CashInImport";
import { DynamicIcon } from "lucide-react/dynamic";
import { cn } from "@heroui/react";


const Legend = ({ icon, text, color, className }: { icon: string, text: string, color: string, className?: string }) => {
  return (
    <span className={`bg-${color}-100 text-${color}-700 border border-${color}-200 pr-2 pl-1 py-0 mt-1 rounded inline-flex items-center box-border select-none ${className}`}>
      <span className={`w-5 h-5 inline-flex items-center justify-center`}>
        <DynamicIcon name={icon as any} size={13} />
      </span>
      <span className={`text-xs font-medium text-${color}-700`}>{text}</span>
    </span>
  );
};

function OrdersDescription({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="text-sm text-gray-600 mb-2">
        Моніторинг експорту та відвантаження замовлень до Діловоду. 
        Дата <b>експорту</b> замовлення до Діловоду завжди = даті оформлення замовлення.
        Дата <b>відвантаження</b> до Діловоду оновлюється при завершенні комплектування
        замовлення в Backoffice. Легенда статусів взаємодії з Діловодом:{' '}
        <Legend icon="search-check" text="Додано в Діловод" color="purple" className="mr-2" />
        <Legend icon="truck" text="Відвантажено" color="green" className="mr-2" />
        <Legend icon="wallet" text="Оплачено" color="yellow" />
      </p>
    </div>
  );
}

function MobileOrdersDescription() {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
      className="relative mb-4 w-full text-left lg:hidden"
    >
      <div
        className={cn(
          "overflow-hidden transition-[max-height] duration-300 ease-out",
          expanded ? "max-h-[480px]" : "max-h-[60px]"
        )}
      >
        <OrdersDescription />
      </div>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent transition-opacity duration-300",
          expanded ? "opacity-0" : "opacity-100"
        )}
      />
    </button>
  );
}

export default function SalesDriveOrders() {
  return (
    <>
      <div className="container bg-white rounded-lg p-4 lg:p-6">
        <OrdersDescription className="mb-6 hidden lg:block [&>p]:leading-relaxed" />
        <MobileOrdersDescription />
        <SalesDriveOrdersTable />
      </div>

      <div className="container bg-white rounded-lg p-6 mt-4">
        <CashInImport />
      </div>
    </>
  );
}
