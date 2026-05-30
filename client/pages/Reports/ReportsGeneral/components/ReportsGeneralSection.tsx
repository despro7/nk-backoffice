import ProductStatsTable from "./ProductStatsTable";
import ReportsSectionCard from "../../shared/ReportsSectionCard";

export default function ReportsGeneralSection() {
  return (
    <ReportsSectionCard title="Загальна статистика по замовленим порціям + Актуальні залишки на складах">
      <ProductStatsTable />
    </ReportsSectionCard>
  );
}