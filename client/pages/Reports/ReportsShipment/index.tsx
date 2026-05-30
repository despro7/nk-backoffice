import ReportsShipmentSummarySection from "./components/ReportsShipmentSummarySection";
import ReportsShipmentTableSection from "./components/ReportsShipmentTableSection";
import useReportsShipment from "./useReportsShipment";

export default function ReportsShipmentPage() {
  const { summary, setSummary } = useReportsShipment();

  return (
    <div className="flex flex-col gap-6">
      <ReportsShipmentSummarySection summary={summary} />
      <ReportsShipmentTableSection onSummaryChange={setSummary} />
    </div>
  );
}