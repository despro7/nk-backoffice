import ShipmentSummaryCards from "./components/ShipmentSummaryCards";
import ProductShippedStatsTable from "./components/ProductShippedStatsTable";
import ReportsSectionCard from "../shared/ReportsSectionCard";
import useReportsShipment from "./useReportsShipment";

export default function ReportsShipmentPage() {
  const { summary, setSummary } = useReportsShipment();

  return (
    <div className="flex flex-col gap-6">
      <ShipmentSummaryCards summary={summary} />
      <ReportsSectionCard>
        <ProductShippedStatsTable onSummaryChange={setSummary} />
      </ReportsSectionCard>
    </div>
  );
}