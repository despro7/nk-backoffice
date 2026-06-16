import { Spinner, Tooltip } from "@heroui/react";
import type { DisplayRow, SalesDynamicsColumn } from "../ReportsSalesDynamicsTypes";
import { DynamicIcon } from "lucide-react/dynamic";

interface ReportsSalesDynamicsTableProps {
  columns: SalesDynamicsColumn[];
  displayRows: DisplayRow[];
  isLoading: boolean;
  renderCell: (row: DisplayRow, columnKey: string) => React.ReactNode;
  salesError: string | null;
}

export default function ReportsSalesDynamicsTable({
  columns,
  displayRows,
  isLoading,
  renderCell,
  salesError,
}: ReportsSalesDynamicsTableProps) {
  return (
    <div className="bg-white rounded-xl overflow-hidden">
      <div className="overflow-x-auto p-4">
        <table className="min-w-full text-left">
          <thead>
            <tr className="bg-default-200/60">
              {columns.map((column) => (
                <th key={column.key} scope="col" className="px-3 py-2 text-sm font-semibold text-default-700 first:rounded-s-sm last:rounded-e-sm">
                  <span className="flex items-center gap-1.5">
                    {column.tooltip && (
                      <Tooltip color="secondary" className="ml-1 max-w-2xs" content={column.tooltip}>
                        <DynamicIcon name="circle-question-mark" size={14} className="inline-block text-default-500" />
                      </Tooltip>
                    )}
                    {column.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-default-500">
                  <Spinner label="Завантаження..." />
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-default-500">
                  {salesError ? "Помилка завантаження" : "Немає даних за обраний місяць"}
                </td>
              </tr>
            ) : (
              displayRows.map((row) => (
                <tr key={row.sku} className="hover:bg-default-100/80">
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-2 text-default-700 align-middle">
                      {renderCell(row, column.key)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}