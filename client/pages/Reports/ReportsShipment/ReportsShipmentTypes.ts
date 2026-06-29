export interface ShipmentSummary {
	/** Загальна кількість відправлених замовлень за обраний період */
	totalOrders: number;
	/** Кількість звичайних замовлень без монолітних наборів */
	regularOrders: number;
	/** Загальна кількість відправлених порцій за обраний період */
	totalPortions: number;
	/** Кількість звичайних порцій без порцій, використаних у монолітних наборах */
	regularPortions: number;
	/** Кількість відвантажених монолітних наборів */
	shippedSetsCount: number;
	/** Сумарна кількість порцій у відвантажених монолітних наборах */
	shippedSetPortions: number;
	/** Кількість унікальних товарів у відправленнях */
	uniqueProducts: number;
}

export interface ProductStats {
	name: string;
	sku: string;
	orderedQuantity: number;
	isSet?: boolean;
	isMonolithicSet?: boolean;
	setPortions?: number;
	/** Кількість порцій цього товару, що були використані як компоненти монолітних наборів */
	monolithicComponentQuantity?: number;
}

export interface ProductDateStats {
	date: string;
	orderedQuantity: number;
}

export interface ShipmentModalProduct {
	name: string;
	sku: string;
}

export interface ShipmentProductOrder {
	externalId: string;
	orderNumber: string;
	ttn?: string | null;
	orderDate?: string | null;
	dilovodSaleExportDate?: string | null;
	dilovodReturnDate?: string | null;
	status: string;
	statusText: string;
	productQuantity?: number | null;
	totalPrice?: number | string | null;
}

export interface ProductStatsResponse {
	success: boolean;
	data: ProductStats[];
	metadata: {
		source: string;
		filters: {
			status: string;
			shippedOnly: boolean;
			dateRange: { startDate: string; endDate: string } | null;
			dayStartHour: number;
		};
		totalProducts: number;
		totalOrders: number;
		ordersWithMonolithicSetsCount: number;
		fetchedAt: string;
	};
}

export interface ProductDateStatsResponse {
	success: boolean;
	data: ProductDateStats[];
	product: {
		name: string;
		sku: string;
	};
	metadata: {
		source: string;
		filters: {
			sku: string;
			status: string;
			dateRange: { startDate: string; endDate: string } | null;
		};
		totalDates: number;
		totalOrders: number;
		fetchedAt: string;
	};
}

export interface ProductShippedStatsTableProps {
	className?: string;
	onSummaryChange?: (summary: ShipmentSummary) => void;
}

export type ShipmentSortDescriptor = {
	column: string;
	direction: "ascending" | "descending";
};