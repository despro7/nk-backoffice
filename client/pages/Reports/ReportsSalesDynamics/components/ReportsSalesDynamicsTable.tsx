import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Spinner } from "@heroui/react";
import type { SortDescriptor } from "@heroui/react";
import { useCallback } from "react";
import type { DisplayRow, SalesDynamicsColumn } from "../ReportsSalesDynamicsTypes";

interface ReportsSalesDynamicsTableProps {
  columns: SalesDynamicsColumn[];
  displayRows: DisplayRow[];
  isLoading: boolean;
  renderCell: (row: DisplayRow, columnKey: string) => React.ReactNode;
  salesError: string | null;
  setSortDescriptor: (value: SortDescriptor) => void;
  sortDescriptor: SortDescriptor;
}

export default function ReportsSalesDynamicsTable({
  columns,
  displayRows,
  isLoading,
  renderCell,
  salesError,
  setSortDescriptor,
  sortDescriptor,
}: ReportsSalesDynamicsTableProps) {
  const handleSortChange = useCallback((descriptor: SortDescriptor) => {
    if (
      descriptor.column === sortDescriptor.column
      && descriptor.direction === sortDescriptor.direction
    ) {
      return;
    }

    setSortDescriptor(descriptor);
  }, [setSortDescriptor, sortDescriptor.column, sortDescriptor.direction]);

  return (
    <div className="bg-white rounded-xl overflow-hidden">
      <Table
        aria-label="Динаміка продажів по тижнях"
        sortDescriptor={sortDescriptor}
        onSortChange={handleSortChange}
        classNames={{
          th: "bg-default-200/60 first:rounded-s-sm last:rounded-e-sm",
          td: [
            "py-2 text-default-700",
            "[&>*]:z-1 [&>*]:relative",
            "before:pointer-events-none before:content-[''] before:absolute before:z-0 before:inset-0 before:opacity-0 before:bg-default/40",
            "group-hover/tr:before:opacity-40",
            "first:before:rounded-s-sm last:before:rounded-e-sm",
          ],
        }}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.key} allowsSorting={column.allowsSorting}>
              {column.label}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody
          items={displayRows}
          isLoading={isLoading}
          loadingContent={<Spinner label="Завантаження..." />}
          emptyContent={isLoading ? " " : salesError ? "Помилка завантаження" : "Немає даних за обраний місяць"}
        >
          {(row) => (
            <TableRow key={row.sku}>
              {(columnKey) => <TableCell>{renderCell(row, columnKey as string)}</TableCell>}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}