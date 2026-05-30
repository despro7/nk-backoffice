import SalesReportTable from "./SalesReportTable";
import ReportsSectionCard from "../../shared/ReportsSectionCard";

export default function ReportsSalesTableSection() {
  return (
    <ReportsSectionCard className="mb-10">
      <SalesReportTable />
    </ReportsSectionCard>
  );
}