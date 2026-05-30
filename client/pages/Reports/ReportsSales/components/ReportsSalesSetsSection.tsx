import SalesSetsReportTable from "./SalesSetsReportTable";
import ReportsSectionCard from "../../shared/ReportsSectionCard";

export default function ReportsSalesSetsSection() {
  return (
    <ReportsSectionCard title="Звіт продажів по наборам" className="mb-10">
      <SalesSetsReportTable />
    </ReportsSectionCard>
  );
}