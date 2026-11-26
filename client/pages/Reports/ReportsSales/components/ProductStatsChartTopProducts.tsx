import { Card, CardBody, CardHeader, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { ReportLoadingOverlay } from "../../shared/ReportLoadingOverlay";
import { cn } from "@/lib/utils";
import type { ProductStatsChartCategoryProduct } from "../ReportsSalesTypes";

interface ProductStatsChartTopProductsProps {
  categoryLabel?: string;
  /** Вже відсортовані сервером за порціями за спаданням */
  products: ProductStatsChartCategoryProduct[];
  loading: boolean;
}

const formatAmount = (value: number) =>
  value.toLocaleString("uk-UA", { maximumFractionDigits: 0 });

const formatShare = (portions: number, total: number) =>
  total > 0 ? `${((portions / total) * 100).toLocaleString("uk-UA", { maximumFractionDigits: 1 })}%` : "–";

// HeroUI задає вагу шрифту на клітинках, тому жирність підсумку ставимо саме на TableCell
const TOTAL_CELL_CLASS = "font-bold text-default-900";

export function ProductStatsChartTopProducts({
  categoryLabel,
  products,
  loading,
}: ProductStatsChartTopProductsProps) {
  const totalPortions = products.reduce((sum, product) => sum + product.portions, 0);
  const totalAmount = products.reduce((sum, product) => sum + product.amount, 0);

  const rows = [
    ...products.map((product, index) => ({ ...product, rank: String(index + 1), isTotal: false })),
    { sku: "total", name: "Разом по категорії", portions: totalPortions, amount: totalAmount, rank: "", isTotal: true },
  ];

  return (
    <Card>
      <CardHeader className="pb-0">
        <p className="text-lg font-semibold">
          Топ продажів за період{categoryLabel ? `: ${categoryLabel}` : ""}
        </p>
      </CardHeader>
      <CardBody className="relative">
        <Table
          aria-label="Топ продажів по товарах категорії"
          removeWrapper
          classNames={{
            th: "bg-default-200/60 text-sm first:rounded-s-sm last:rounded-e-sm",
            td: "py-2 text-sm text-default-700",
            tr: "border-b border-default-100 last:border-b-0",
          }}
        >
          <TableHeader>
            <TableColumn className="w-12">№</TableColumn>
            <TableColumn>Товар</TableColumn>
            <TableColumn className="text-right">Порції</TableColumn>
            <TableColumn className="text-right">Частка</TableColumn>
            <TableColumn className="text-right">Сума, ₴</TableColumn>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.sku} className={row.isTotal ? "bg-default-50" : undefined}>
                <TableCell className={row.isTotal ? TOTAL_CELL_CLASS : undefined}>{row.rank}</TableCell>
                <TableCell className={row.isTotal ? TOTAL_CELL_CLASS : undefined}>{row.name}</TableCell>
                <TableCell className={cn("text-right", row.isTotal && TOTAL_CELL_CLASS)}>{row.portions}</TableCell>
                <TableCell className={cn("text-right", row.isTotal && TOTAL_CELL_CLASS)}>
                  {formatShare(row.portions, totalPortions)}
                </TableCell>
                <TableCell className={cn("text-right", row.isTotal && TOTAL_CELL_CLASS)}>
                  {row.amount > 0 ? formatAmount(row.amount) : "–"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ReportLoadingOverlay loading={loading} className="rounded-lg" />
      </CardBody>
    </Card>
  );
}
