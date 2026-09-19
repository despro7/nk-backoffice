import { Chip } from '@heroui/react';
import { StockBadge } from '@/components/StockBadge';
import { parseDilovodErrorText, dedupeAndNormalize } from '@/lib/metaLogsParser';

export type BulkExportResultItem = {
	orderNumber: string;
	exportSuccess?: boolean | null;
	shipmentSuccess?: boolean | null;
	errors?: string[];
};

function StatusChip({ value }: { value?: boolean | null }) {
	if (value === true) {
		return <Chip size="sm" color="success" variant="flat">OK</Chip>;
	}
	if (value === false) {
		return <Chip size="sm" color="danger" variant="flat">Помилка</Chip>;
	}
	return <Chip size="sm" color="secondary" variant="flat" className="text-default-500 px-4">—</Chip>;
}

function collectParsedItems(errors: string[] | undefined) {
	const names: string[] = [];
	const skus: string[] = [];
	const needed: string[] = [];
	const stock: string[] = [];
	const missing: string[] = [];

	for (const err of errors ?? []) {
		const parsed = parseDilovodErrorText(err);
		names.push(...parsed.names);
		skus.push(...parsed.skus);
		needed.push(...parsed.needed);
		stock.push(...parsed.stock);
		missing.push(...parsed.missing);
	}

	return dedupeAndNormalize({ names, skus, needed, stock, missing });
}

export default function BulkExportResultsTable({ items }: { items: BulkExportResultItem[] }) {
	return (
		<div className="overflow-x-auto my-6">
			<table className="min-w-full border border-default-200 text-sm">
				<thead>
					<tr className="bg-default-50 text-xs text-default-500">
						<th className="border border-default-200 px-2 py-2 text-left">№ замовл.</th>
						<th className="border border-default-200 px-2 py-2 text-left">Експорт</th>
						<th className="border border-default-200 px-2 py-2 text-left">Відвантаж.</th>
						<th className="border border-default-200 px-2 py-2 text-left">Товар</th>
						<th className="border border-default-200 px-2 py-2 text-left">Артикул</th>
						<th className="border border-default-200 px-2 py-2 text-left">Потрібно</th>
						<th className="border border-default-200 px-2 py-2 text-left">Залишок&nbsp;<span className="text-xs text-danger-500">*</span></th>
						<th className="border border-default-200 px-2 py-2 text-left">Бракує</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item, idx) => {
						const parsed = collectParsedItems(item.errors);
						const hasStructuredItems = parsed.names.length > 0;
						const rowSpan = Math.max(parsed.names.length, 1);

						if (!hasStructuredItems) {
							return (
								<tr key={`${item.orderNumber}-${idx}`} className="odd:bg-background-paper even:bg-default-50">
									<td className="border border-default-200 px-2 py-2 text-sm font-medium align-top">{item.orderNumber}</td>
									<td className="border border-default-200 px-2 py-2 align-top"><StatusChip value={item.exportSuccess} /></td>
									<td className="border border-default-200 px-2 py-2 align-top"><StatusChip value={item.shipmentSuccess} /></td>
									<td colSpan={5} className="border border-default-200 px-2 py-2 align-top leading-tight font-medium">
										{item.errors && item.errors.length > 0 ? (
											<ol className="space-y-1">
												{item.errors.map((err, i) => (
													<li key={i} className="text-danger text-sm whitespace-pre-wrap break-words">{err}</li>
												))}
											</ol>
										) : (
											<span className="text-default-500">—</span>
										)}
									</td>
								</tr>
							);
						}

						return parsed.names.map((name, lineIdx) => (
							<tr key={`${item.orderNumber}-${idx}-${lineIdx}`} className="[&:hover>td:nth-last-child(-n+5)]:bg-default-100">
								{lineIdx === 0 && (
									<>
										<td rowSpan={rowSpan} className="border border-default-200 px-2 py-2 font-medium align-top">{item.orderNumber}</td>
										<td rowSpan={rowSpan} className="border border-default-200 px-2 py-2 align-top"><StatusChip value={item.exportSuccess} /></td>
										<td rowSpan={rowSpan} className="border border-default-200 px-2 py-2 align-top"><StatusChip value={item.shipmentSuccess} /></td>
									</>
								)}
								<td className="border border-default-200 px-2 py-2 align-top font-medium leading-tight">{name}</td>
								<td className="border border-default-200 px-2 py-2 align-top font-mono text-xs">{parsed.skus[lineIdx] ?? '—'}</td>
								<td className="border border-default-200 px-2 py-2 align-top">{parsed.needed[lineIdx] ?? '—'}</td>
								<td className="border border-default-200 px-2 py-2 align-top">{parsed.stock[lineIdx] ?? '—'}</td>
								<td className="border border-default-200 px-2 py-2 align-top text-danger font-medium">{parsed.missing[lineIdx] ?? '—'}</td>
							</tr>
						));
					})}
				</tbody>
			</table>
		<div className="mt-4 pb-1 text-xs text-secondary flex items-center">
			<span className="mr-1 text-danger-500">*</span>
			<span>
				– мається на увазі саме залишок на Малому складі
				<StockBadge variant="ms" size="10px" className="inline-block leading-none ml-1" />
			</span>
		</div>
		</div>
	);
}
