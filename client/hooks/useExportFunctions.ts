import { useCallback } from "react";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { addToast } from "@heroui/react";
import type { DateRange } from "@react-types/datepicker";

interface SalesData {
	date: string;
	ordersCount: number;
	portionsCount: number;
	ordersByStatus: { [status: string]: number };
	portionsByStatus: { [status: string]: number };
	ordersBySource: { [source: string]: number };
	portionsBySource: { [source: string]: number };
	priceBySource: { [source: string]: number };
	ordersWithDiscountReason: number;
	portionsWithDiscountReason: number;
	discountReasonText: string;
	totalPrice: number | undefined;
	orders: Array<{
		orderNumber: string;
		portionsCount: number;
		source: string;
		createdAt: string;
		orderDate: string;
		orderTime: string;
		externalId: string;
		status: string;
		totalPrice?: number | undefined;
		hasDiscount?: boolean;
		discountReasonCode?: string | null;
	}>;
}

interface ExportFunctionsProps {
	filteredSalesData: SalesData[];
	dateRange: DateRange | null;
}

export const useExportFunctions = ({ filteredSalesData, dateRange }: ExportFunctionsProps) => {
	// Експорт у Excel
	const exportToExcel = useCallback(() => {
		if (filteredSalesData.length === 0) {
			addToast({
				title: "Немає даних",
				description: "Немає даних для експорту",
				color: "warning",
				timeout: 3000,
			});
			return;
		}

		// Створюємо дані для експорту
		const headers = [
			'Дата',
			'Кіл-ть замовлень',
			'Кіл-ть порцій',
			'Загальна сума',
			'Сайт (замовлень)',
			'Сайт (порцій)',
			'Сайт (сума)',
			'Rozetka (замовлень)',
			'Rozetka (порцій)',
			'Rozetka (сума)',
			'Prom.ua (замовлень)',
			'Prom.ua (порцій)',
			'Prom.ua (сума)',
			'Інше (замовлень)',
			'Інше (порцій)',
			'Інше (сума)'
		];

		const data = filteredSalesData.map(row => [
			row.date,
			row.ordersCount,
			row.portionsCount,
			row.totalPrice || 0,
			row.ordersBySource['nk-food.shop'] || 0,
			row.portionsBySource['nk-food.shop'] || 0,
			row.priceBySource?.['nk-food.shop'] || 0,
			row.ordersBySource['rozetka'] || 0,
			row.portionsBySource['rozetka'] || 0,
			row.priceBySource?.['rozetka'] || 0,
			row.ordersBySource['prom.ua'] || 0,
			row.portionsBySource['prom.ua'] || 0,
			row.priceBySource?.['prom.ua'] || 0,
			row.ordersBySource['інше'] || 0,
			row.portionsBySource['інше'] || 0,
			row.priceBySource?.['інше'] || 0,
		]);

		// Створюємо worksheet з даними
		const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);

		// Налаштовуємо ширину колонок
		worksheet['!cols'] = [
			{ wch: 10 }, // Дата
			{ wch: 8 }, // Кіл-ть замовлень
			{ wch: 10 }, // Кіл-ть порцій
			{ wch: 12 }, // Загальна сума
			{ wch: 8 }, // Сайт (замовлень)
			{ wch: 10 }, // Сайт (порцій)
			{ wch: 12 }, // Сайт (сума)
			{ wch: 8 }, // Rozetka (замовлень)
			{ wch: 10 }, // Rozetka (порцій)
			{ wch: 12 }, // Rozetka (сума)
			{ wch: 8 }, // Prom.ua (замовлень)
			{ wch: 10 }, // Prom.ua (порцій)
			{ wch: 12 }, // Prom.ua (сума)
			{ wch: 8 }, // Інше (замовлень)
			{ wch: 10 }, // Інше (порцій)
			{ wch: 12 }, // Інше (сума)
		];

		// Форматуємо числові дані як валюту (з двома десятковими знаками)
		const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
		for (let row = 1; row <= range.e.r; row++) {
			for (let col = 0; col <= range.e.c; col++) {
				const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
				const cell = worksheet[cellAddress];
				if (cell && typeof cell.v === 'number') {
					// Для колонок з сумою (колонки 3, 6, 9, 12, 15 - індекси з 0)
					if ([3, 6, 9, 12, 15].includes(col)) {
						cell.t = 'n';
						cell.z = '#,##0.00'; // Формат валюти з 2 десятковими знаками
					} else {
						cell.t = 'n';
					}
				}
			}
		}

		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, worksheet, "Звіт продажів");

		const startDate = dateRange?.start ? `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, '0')}-${String(dateRange.start.day).padStart(2, '0')}` : '';
		const endDate = dateRange?.end ? `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, '0')}-${String(dateRange.end.day).padStart(2, '0')}` : '';
		const fileName = `Звіт_продажів_${startDate}–${endDate}.xlsx`;
		XLSX.writeFile(workbook, fileName);
	}, [filteredSalesData, dateRange]);

	// Експорт у TXT
	const exportToTXT = useCallback(() => {
		if (filteredSalesData.length === 0) {
			addToast({
				title: "Немає даних",
				description: "Немає даних для експорту",
				color: "warning",
				timeout: 3000,
			});
			return;
		}

		const startDate = dateRange?.start ? `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, '0')}-${String(dateRange.start.day).padStart(2, '0')}` : '';
		const endDate = dateRange?.end ? `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, '0')}-${String(dateRange.end.day).padStart(2, '0')}` : '';

		let txtContent = `Звіт продажів\nПеріод: ${startDate} – ${endDate}\n\n`;
		filteredSalesData.forEach(row => {
			txtContent += `Дата: ${row.date}\n`;
			txtContent += `Кількість замовлень: ${row.ordersCount}\n`;
			txtContent += `Кількість порцій: ${row.portionsCount}\n`;
			txtContent += `Загальна сума: ${row.totalPrice || 'Н/Д'} ₴\n`;

			// Деталі по джерелах
			const sources = Object.keys(row.ordersBySource);
			if (sources.length > 0) {
				txtContent += `По джерелах:\n`;
				sources.forEach(source => {
					const orders = row.ordersBySource[source] || 0;
					const portions = row.portionsBySource[source] || 0;
					const price = row.priceBySource?.[source] || 0;
					txtContent += `  ${source}: ${orders} замовлень, ${portions} порцій, ${price} ₴\n`;
				});
			}

			txtContent += `\n`;
		});

		const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
		const fileName = `Звіт_продажів_${startDate}–${endDate}.txt`;
		saveAs(blob, fileName);
	}, [filteredSalesData, dateRange]);

	return {
		exportToExcel,
		exportToTXT,
	};
};
