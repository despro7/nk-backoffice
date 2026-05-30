import type { Dispatch, SetStateAction } from "react";
import ProductShippedStatsTable from "./ProductShippedStatsTable";
import type { ShipmentSummary } from "../ReportsShipmentTypes";
import ReportsSectionCard from "../../shared/ReportsSectionCard";

interface ReportsShipmentTableSectionProps {
  onSummaryChange: Dispatch<SetStateAction<ShipmentSummary>>;
}

export default function ReportsShipmentTableSection({
  onSummaryChange,
}: ReportsShipmentTableSectionProps) {
  return (
    <ReportsSectionCard>
      <ProductShippedStatsTable onSummaryChange={onSummaryChange} />
    </ReportsSectionCard>
  );
}