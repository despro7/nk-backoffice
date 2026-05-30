import ProductStatsChart from "./ProductStatsChart";
import ReportsSectionCard from "../../shared/ReportsSectionCard";

export default function ReportsSalesChartSection() {
  return (
    <ReportsSectionCard title="Графік проданих порцій по категоріях і наборах" className="mb-10">
      <ProductStatsChart />
    </ReportsSectionCard>
  );
}