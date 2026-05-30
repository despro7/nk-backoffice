import { Select, SelectItem } from "@heroui/react";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { GROUP_BY_OPTIONS } from "../ReportsSalesDynamicsUtils";
import type { GroupBy } from "../ReportsSalesDynamicsTypes";

interface SalesDynamicsFirmOption {
  id: string;
  name: string;
}

interface ReportsSalesDynamicsToolbarProps {
  firms: SalesDynamicsFirmOption[];
  groupBy: GroupBy;
  isFirmLoading: boolean;
  selectedFirmId: string | undefined;
  selectedMonth: Date;
  setGroupBy: (value: GroupBy) => void;
  setSelectedFirmId: (value: string | undefined) => void;
  setSelectedMonth: (value: Date) => void;
}

export default function ReportsSalesDynamicsToolbar({
  firms,
  groupBy,
  isFirmLoading,
  selectedFirmId,
  selectedMonth,
  setGroupBy,
  setSelectedFirmId,
  setSelectedMonth,
}: ReportsSalesDynamicsToolbarProps) {
  return (
    <div className="bg-white rounded-xl p-4 flex flex-wrap items-center gap-3 justify-between">
      <h1 className="text-lg font-semibold text-default-800">Динаміка продажів по тижнях</h1>
      <div className="flex items-center gap-3">
        <Select
          aria-label="Фірма"
          size="sm"
          className="w-48"
          selectedKeys={selectedFirmId ? [selectedFirmId] : []}
          onSelectionChange={(keys) => {
            const value = Array.from(keys)[0] as string | undefined;
            setSelectedFirmId(value);
          }}
          disabled={firms.length === 0 || isFirmLoading}
        >
          {firms.map((firm) => (
            <SelectItem key={firm.id}>{firm.name}</SelectItem>
          ))}
        </Select>

        <MonthSwitcher value={selectedMonth} onChange={setSelectedMonth} disableFuture size="sm" />

        <Select
          aria-label="Режим відображення"
          size="sm"
          className="w-48"
          selectedKeys={[groupBy]}
          onSelectionChange={(keys) => {
            const value = Array.from(keys)[0] as GroupBy;
            if (value) {
              setGroupBy(value);
            }
          }}
        >
          {GROUP_BY_OPTIONS.map((option) => (
            <SelectItem key={option.key}>{option.label}</SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
}