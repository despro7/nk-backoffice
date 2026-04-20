import ProductStatsTable from "@/components/ProductStatsTable";

export default function Reports() {
  return (
    <>
    <div className="bg-white rounded-lg p-6">
      <h3 className="text-xl font-semibold mb-6">Загальна статистика по замовленим порціям + Актуальні залишки на складах</h3>
      <ProductStatsTable />
    </div>
    </>
  );
}