import ProductStatsChart from "@/components/ProductStatsChart";
import SalesReportTable from "../components/SalesReportTable";
import ProductStatsTable from "@/components/ProductStatsTable";
import ProductShippedStatsTable from "@/components/ProductShippedStatsTable";

export default function Reports() {
  return (
    <>
    <div className="bg-white rounded-lg p-6 mb-10">
      <h2 className="text-xl font-semibold mb-6">Статистика продажів</h2>
      <SalesReportTable />
    </div>

    <div className="bg-white rounded-lg p-6 mb-10">
      <h2 className="text-xl font-semibold mb-6">Графік продажів по порціям</h2>
      <ProductStatsChart />
    </div>
        
    <div className="bg-white rounded-lg p-6">
      <h3 className="text-xl font-semibold mb-6">Загальна статистика по замовленим порціям</h3>
      <ProductStatsTable />
    </div>

    <div className="bg-white rounded-lg p-6">
      <h3 className="text-xl font-semibold mb-6">Статистика по відвантаженим порціям</h3>
      <ProductShippedStatsTable />
    </div>
    </>
  );
}