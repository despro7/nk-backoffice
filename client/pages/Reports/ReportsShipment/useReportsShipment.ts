import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ShipmentSummary } from "./ReportsShipmentTypes";

export interface UseReportsShipmentReturn {
  summary: ShipmentSummary;
  setSummary: Dispatch<SetStateAction<ShipmentSummary>>;
}

export default function useReportsShipment(): UseReportsShipmentReturn {
  const [summary, setSummary] = useState<ShipmentSummary>({
    totalOrders: 0,
    totalPortions: 0,
    uniqueProducts: 0,
  });

  return {
    summary,
    setSummary,
  };
}