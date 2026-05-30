import { Alert } from "@heroui/react";
import ReportsSalesDynamicsSummary from "./components/ReportsSalesDynamicsSummary";
import ReportsSalesDynamicsTable from "./components/ReportsSalesDynamicsTable";
import ReportsSalesDynamicsToolbar from "./components/ReportsSalesDynamicsToolbar";
import useReportsSalesDynamics from "./useReportsSalesDynamics";

export default function ReportsSalesDynamicsPage() {
	const {
		columns,
		dilovodSettings,
		displayRows,
		groupBy,
		isSalesLoading,
		renderCell,
		rows,
		salesData,
		salesError,
		selectedFirmId,
		selectedMonth,
		setGroupBy,
		setSelectedFirmId,
		setSelectedMonth,
		setSortDescriptor,
		showFirmInfoAlert,
		sortDescriptor,
	} = useReportsSalesDynamics();

	return (
		<div className="flex flex-col gap-4">
			<ReportsSalesDynamicsToolbar
				firms={dilovodSettings?.directories?.firms || []}
				groupBy={groupBy}
				isFirmLoading={dilovodSettings.loadingDirectories}
				selectedFirmId={selectedFirmId}
				selectedMonth={selectedMonth}
				setGroupBy={setGroupBy}
				setSelectedFirmId={setSelectedFirmId}
				setSelectedMonth={setSelectedMonth}
			/>

			{showFirmInfoAlert && (
				<Alert
					title="Залишки на початок місяця залежать від фірми!"
					description="Більшість товарів повертають нульові залишки для обраної фірми. Спробуйте обрати іншу фірму у фільтрах."
					color="warning"
					variant="faded"
					classNames={{ base: "mb-2" }}
				/>
			)}

			{salesError && (
				<div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-danger-700 text-sm">
					❌ {salesError}
				</div>
			)}

			<ReportsSalesDynamicsTable
				columns={columns}
				displayRows={displayRows}
				isLoading={isSalesLoading}
				renderCell={renderCell}
				salesError={salesError}
				setSortDescriptor={setSortDescriptor}
				sortDescriptor={sortDescriptor}
			/>

			<ReportsSalesDynamicsSummary
				rowsCount={rows.length}
				salesData={salesData}
				visible={!isSalesLoading}
			/>
		</div>
	);
}