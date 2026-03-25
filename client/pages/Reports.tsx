import ProductStatsTable from "@/components/ProductStatsTable";
import ProductShippedStatsTable from "@/components/ProductShippedStatsTable";

export default function Reports() {
  return (
    <>
    <div className="bg-white rounded-lg p-6">
      <h3 className="text-xl font-semibold mb-6">Загальна статистика по замовленим порціям</h3>
      <ProductStatsTable />
    </div>
    </>
  );
}