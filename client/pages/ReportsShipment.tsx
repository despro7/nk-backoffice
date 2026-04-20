import { useState } from "react";
import ProductShippedStatsTable from "@/components/ProductShippedStatsTable";
import ShipmentSummaryCards, { type ShipmentSummary } from "@/components/ShipmentSummaryCards";

export default function Reports() {
	const [summary, setSummary] = useState<ShipmentSummary>({
		totalOrders: 0,
		totalPortions: 0,
		uniqueProducts: 0,
	});

	return (
		<div className="flex flex-col gap-6">
			<ShipmentSummaryCards summary={summary} />
			{/* TODO: Швидкий перемикач дат */}
			<div className="bg-white rounded-lg p-6">
				<ProductShippedStatsTable onSummaryChange={setSummary} />
			</div>
		</div>
	);
}