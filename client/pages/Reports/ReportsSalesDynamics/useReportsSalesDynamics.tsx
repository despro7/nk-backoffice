import { useState, useEffect, useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import { Chip, Spinner } from "@heroui/react";
import type { SortDescriptor } from "@heroui/react";
import { getValueColor } from "@/lib/utils";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { useDilovodSettings } from "@/hooks/useDilovodSettings";
import { getPercentChip, getPercentSortValue } from "./ReportsSalesDynamicsUtils";
import type {
  DisplayRow,
  GroupBy,
  PeriodMeta,
  SalesDynamicsColumn,
  SalesDynamicsResponse,
  SalesDynamicsRow,
  StockSnapshotResponse,
} from "./ReportsSalesDynamicsTypes";

export interface UseReportsSalesDynamicsReturn {
  columns: SalesDynamicsColumn[];
  dilovodSettings: ReturnType<typeof useDilovodSettings>;
  displayRows: DisplayRow[];
  groupBy: GroupBy;
  isSalesLoading: boolean;
  renderCell: (row: DisplayRow, columnKey: string) => ReactNode;
  rows: SalesDynamicsRow[];
  salesData: SalesDynamicsResponse | null;
  salesError: string | null;
  selectedFirmId: string | undefined;
  selectedMonth: Date;
  setGroupBy: (value: GroupBy) => void;
  setSelectedFirmId: (value: string | undefined) => void;
  setSelectedMonth: (value: Date) => void;
  setSortDescriptor: (value: SortDescriptor) => void;
  showFirmInfoAlert: boolean;
  sortDescriptor: SortDescriptor;
}

export default function useReportsSalesDynamics(): UseReportsSalesDynamicsReturn {
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();
  const dilovodSettings = useDilovodSettings();
  const [selectedFirmId, setSelectedFirmId] = useState<string | undefined>(undefined);
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [groupBy, setGroupBy] = useState<GroupBy>("week4");
  const [salesData, setSalesData] = useState<SalesDynamicsResponse | null>(null);
  const [stockData, setStockData] = useState<StockSnapshotResponse | null>(null);
  const [isSalesLoading, setIsSalesLoading] = useState(false);
  const [isStockLoading, setIsStockLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "salePercent",
    direction: "descending",
  });

  useEffect(() => {
    if (selectedFirmId) {
      return;
    }

    const defaultFirm = dilovodSettings?.settings?.defaultFirmId;
    const firstFirm = dilovodSettings?.directories?.firms?.[0]?.id;

    if (defaultFirm) {
      setSelectedFirmId(defaultFirm);
    } else if (firstFirm) {
      setSelectedFirmId(firstFirm);
    }
  }, [selectedFirmId, dilovodSettings?.settings?.defaultFirmId, dilovodSettings?.directories]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    let cancelled = false;

    setIsSalesLoading(true);
    setSalesError(null);
    setStockData(null);
    setSalesData(null);

    apiCall(`/api/stat/sales-dynamics?year=${year}&month=${month}&groupBy=${groupBy}`)
      .then((response) => response.json())
      .then((data: SalesDynamicsResponse) => {
        if (cancelled) {
          return;
        }

        if (!data.success) {
          throw new Error("Сервер повернув помилку");
        }

        setSalesData(data);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSalesError(error instanceof Error ? error.message : "Помилка завантаження даних");
      })
      .finally(() => {
        if (!cancelled) {
          setIsSalesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMonth, groupBy, isAuthLoading, apiCall]);

  useEffect(() => {
    const skus = salesData?.data?.rows?.map((row) => row.sku).filter(Boolean) ?? [];

    if (skus.length === 0) {
      return;
    }

    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    const asOfDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
    const skusParam = skus.join(",");
    let cancelled = false;

    setIsStockLoading(true);

    const firmId = selectedFirmId ?? dilovodSettings?.settings?.defaultFirmId ?? undefined;
    const encodedLen =
      encodeURIComponent(skusParam).length +
      encodeURIComponent(asOfDate).length +
      (firmId ? encodeURIComponent(firmId).length : 0);
    const usePost = encodedLen > 2000;

    (async () => {
      try {
        let response: Response;

        if (usePost) {
          response = await apiCall("/api/warehouse/stock-snapshot", {
            method: "POST",
            body: JSON.stringify({ skus, asOfDate, firmId }),
          });
        } else {
          const url =
            `/api/warehouse/stock-snapshot?skus=${encodeURIComponent(skusParam)}&asOfDate=${asOfDate}` +
            (firmId ? `&firmId=${encodeURIComponent(firmId)}` : "");
          response = await apiCall(url);
        }

        const data: StockSnapshotResponse = await response.json();

        if (!cancelled) {
          setStockData(data);
        }
      } catch (error) {
        console.error("[SalesDynamics] Помилка завантаження залишків:", error);
      } finally {
        if (!cancelled) {
          setIsStockLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [salesData, selectedMonth, selectedFirmId, dilovodSettings?.settings?.defaultFirmId, apiCall]);

  const periods = useMemo<PeriodMeta[]>(() => salesData?.data?.periods ?? [], [salesData]);
  const rows = useMemo<SalesDynamicsRow[]>(() => salesData?.data?.rows ?? [], [salesData]);

  const stockMap = useMemo<Record<string, number>>(() => {
    if (!stockData?.stocks) {
      return {};
    }

    const map: Record<string, number> = {};

    for (const [sku, stock] of Object.entries(stockData.stocks)) {
      map[sku] = (stock.mainStock ?? 0) + (stock.smallStock ?? 0);
    }

    return map;
  }, [stockData]);

  const zeroStocksCount = useMemo(() => {
    if (!stockData?.stocks || rows.length === 0) {
      return 0;
    }

    let count = 0;

    for (const row of rows) {
      const stock = stockData.stocks[row.sku];
      const total = stock ? (stock.mainStock ?? 0) + (stock.smallStock ?? 0) : 0;

      if (total === 0) {
        count += 1;
      }
    }

    return count;
  }, [stockData, rows]);

  const showFirmInfoAlert = zeroStocksCount > Math.floor(rows.length / 2);

  const sortedRows = useMemo<SalesDynamicsRow[]>(() => {
    return [...rows].sort((left, right) => {
      const column = sortDescriptor.column as string;
      const direction = sortDescriptor.direction === "ascending" ? 1 : -1;

      if (column === "productName") {
        return left.productName.localeCompare(right.productName, "uk") * direction;
      }

      if (column === "openingStock") {
        const leftStock = stockMap[left.sku] ?? 0;
        const rightStock = stockMap[right.sku] ?? 0;
        return (leftStock - rightStock) * direction;
      }

      if (column === "totalSold") {
        return (left.totalSold - right.totalSold) * direction;
      }

      if (column === "salePercent") {
        const leftPercent = getPercentSortValue(left.totalSold, stockMap[left.sku]);
        const rightPercent = getPercentSortValue(right.totalSold, stockMap[right.sku]);

        if (leftPercent === Infinity && rightPercent === Infinity) {
          return 0;
        }

        if (leftPercent === Infinity) {
          return -1 * direction;
        }

        if (rightPercent === Infinity) {
          return 1 * direction;
        }

        return (leftPercent - rightPercent) * direction;
      }

      const leftQuantity = left.periods[column] ?? 0;
      const rightQuantity = right.periods[column] ?? 0;
      return (leftQuantity - rightQuantity) * direction;
    });
  }, [rows, sortDescriptor, stockMap]);

  const displayRows = useMemo<DisplayRow[]>(
    () =>
      sortedRows.map((row) => ({
        ...row,
        _stock: isStockLoading ? undefined : stockMap[row.sku] !== undefined ? stockMap[row.sku] : null,
      })),
    [sortedRows, stockMap, isStockLoading],
  );

  const columns = useMemo<SalesDynamicsColumn[]>(() => {
    const base = [
      { key: "productName", label: "Товар", allowsSorting: true },
      { key: "openingStock", label: "Початок місяця", allowsSorting: true },
    ];
    const periodColumns = periods.map((period) => ({
      key: period.key,
      label: period.label,
      allowsSorting: true,
    }));
    const end = [
      { key: "totalSold", label: "Всього", allowsSorting: true },
      { key: "salePercent", label: "Продаж %", allowsSorting: true },
    ];

    return [...base, ...periodColumns, ...end];
  }, [periods]);

  const allOpeningStocks = useMemo<number[]>(() => displayRows.map((row) => row._stock ?? 0), [displayRows]);
  const allTotalSolds = useMemo<number[]>(() => displayRows.map((row) => row.totalSold), [displayRows]);

  const renderCell = useCallback(
    (row: DisplayRow, columnKey: string): ReactNode => {
      if (columnKey === "productName") {
        return <span className="font-medium text-sm">{row.productName}</span>;
      }

      if (columnKey === "openingStock") {
        if (row._stock === undefined) {
          return <Spinner size="sm" />;
        }

        if (row._stock === null) {
          return <span className="text-default-400">—</span>;
        }

        const colors = getValueColor(row._stock, allOpeningStocks);
        return (
          <Chip size="sm" variant="flat" classNames={{ base: colors.base, content: colors.content }}>
            {row._stock.toLocaleString("uk-UA")}
          </Chip>
        );
      }

      if (columnKey === "totalSold") {
        const colors = getValueColor(row.totalSold, allTotalSolds);
        return (
          <Chip size="sm" variant="flat" classNames={{ base: colors.base, content: colors.content }}>
            {row.totalSold.toLocaleString("uk-UA")}
          </Chip>
        );
      }

      if (columnKey === "salePercent") {
        const openingStock = row._stock === undefined ? undefined : (row._stock ?? 0);
        return getPercentChip(row.totalSold, openingStock);
      }

      const quantity = row.periods[columnKey] ?? 0;
      return (
        <span className={quantity === 0 ? "text-default-300 text-sm" : "text-sm"}>
          {quantity === 0 ? "—" : quantity.toLocaleString("uk-UA")}
        </span>
      );
    },
    [allOpeningStocks, allTotalSolds],
  );

  return {
    columns,
    dilovodSettings,
    displayRows,
    groupBy,
    isSalesLoading,
    renderCell,
    rows,
    salesData,
    salesError,
    selectedFirmId,
    selectedMonth,
    setGroupBy,
    setSelectedFirmId,
    setSelectedMonth,
    setSortDescriptor,
    showFirmInfoAlert,
    sortDescriptor,
  };
}