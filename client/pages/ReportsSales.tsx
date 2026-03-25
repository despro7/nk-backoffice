import ProductStatsChart from "@/components/ProductStatsChart";
import SalesReportTable from "../components/SalesReportTable";

export default function Reports() {
	return (
		<>
		<div className="bg-white rounded-lg p-6 mb-10">
			<SalesReportTable />
		</div>

		<div className="bg-white rounded-lg p-6 mb-10">
			<h2 className="text-xl font-semibold mb-6">Графік продажів по порціям</h2>
			<ProductStatsChart />
		</div>
		</>
	);
}