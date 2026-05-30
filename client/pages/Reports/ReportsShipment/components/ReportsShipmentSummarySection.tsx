import ShipmentSummaryCards from "./ShipmentSummaryCards";
import type { ShipmentSummary } from "../ReportsShipmentTypes";

interface ReportsShipmentSummarySectionProps {
  summary: ShipmentSummary;
}

export default function ReportsShipmentSummarySection({
  summary,
}: ReportsShipmentSummarySectionProps) {
  return <ShipmentSummaryCards summary={summary} />;
}