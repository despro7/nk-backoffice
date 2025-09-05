import ProductStatsChart from "@/components/ProductStatsChart";
import SalesReportTable from "../components/SalesReportTable";

export default function Reports() {
  return (
    <>
    <div className="bg-white rounded-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-6">Графік продажів по порціям</h2>
      <div className="mb-6">
        <ProductStatsChart />
      </div>
    </div>
        
    <div className="w-full bg-white p-4 rounded-lg">
      <SalesReportTable />
    </div>
    </>
  );
}