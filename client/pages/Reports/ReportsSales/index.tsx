import ReportsSalesChartSection from "./components/ReportsSalesChartSection";
import ReportsSalesSetsSection from "./components/ReportsSalesSetsSection";
import ReportsSalesTableSection from "./components/ReportsSalesTableSection";

export default function ReportsSalesPage() {
  return (
    <>
      <ReportsSalesTableSection />
      <ReportsSalesSetsSection />
      <ReportsSalesChartSection />
    </>
  );
}