import { Table, TableHeader, TableBody, TableColumn, TableRow, TableCell, Card, CardBody } from "@heroui/react";
import { formatRelativeDate } from "@/lib/formatUtils";

export function DateFormatSettings() {
  const now = new Date();

  const demoDates = [
    {
      label: `formatRelativeDate(utcDate)`,
      comment: "Тільки що",
      value: formatRelativeDate(now.toISOString()),
    },
    {
      label: `formatRelativeDate(utcDate)`,
      comment: "5 хв тому",
      value: formatRelativeDate(new Date(now.getTime() - 5 * 60 * 1000).toISOString()),
    },
    {
        isSeparator: true,
    },
    {
      label: `formatRelativeDate(utcDate)`,
      comment: "6 год тому",
      value: formatRelativeDate(new Date(now.getTime() - 6.5 * 60 * 60 * 1000).toISOString()),
    },
    {
      label: `formatRelativeDate(utcDate)`,
      comment: "Вчора о 19:20",
      value: formatRelativeDate(new Date('2025-09-19T16:20:00Z').toISOString()),
    },
    {
      label: `formatRelativeDate(utcDate, { showTime: false })`,
      comment: "Вчора",
      value: formatRelativeDate(new Date('2025-09-19T16:20:00Z').toISOString(), { showTime: false }),
    },
    {
      label: `formatRelativeDate(utcDate, { maxRelativeHours: 24 })`,
      comment: "8 год тому",
      value: formatRelativeDate(new Date('2025-09-19T16:20:00Z').toISOString(), { maxRelativeHours: 24 }),
    },
    {
        isSeparator: true,
    },
    {
      label: `formatRelativeDate(utcDate)`,
      comment: "Позавчора об 11:26",
      value: formatRelativeDate(new Date(now.getTime() - (2 * 24 - 8) * 60 * 60 * 1000).toISOString()),
    },
    {
      label: `formatRelativeDate(utcDate, { showTime: false })`,
      comment: "Позавчора",
      value: formatRelativeDate(new Date(now.getTime() - (2 * 24 - 8) * 60 * 60 * 1000).toISOString(), { showTime: false }),
    },
    {
        isSeparator: true,
    },
    {
      label: `formatRelativeDate(utcDate)`,
      comment: "3 дні тому об 11:26",
      value: formatRelativeDate(new Date(now.getTime() - (3 * 24 - 8) * 60 * 60 * 1000).toISOString()),
    },
    {
      label: `formatRelativeDate(utcDate, { showTime: false })`,
      comment: "5 днів тому",
      value: formatRelativeDate(new Date(now.getTime() - (5 * 24 - 8) * 60 * 60 * 1000).toISOString(), { showTime: false }),
    },
    {
        isSeparator: true,
    },
    {
      label: `formatRelativeDate(utcDate, { maxRelativeDays: 1, showTime: false })`,
      comment: "17.09.2025",
      value: formatRelativeDate(new Date(now.getTime() - 56 * 60 * 60 * 1000).toISOString(), { maxRelativeDays: 1, showTime: false }),
    },
    {
      label: `formatRelativeDate(utcDate, { maxRelativeDays: 1 })`,
      comment: "17.09.2025",
      value: formatRelativeDate(new Date(now.getTime() - 56 * 60 * 60 * 1000).toISOString(), { maxRelativeDays: 1 }),
    },
    {
      label: `formatRelativeDate(utcDate, { includeWeekdays: true, showTime: false })`,
      comment: "Середа, 17.09.2025",
      value: formatRelativeDate(new Date(now.getTime() - 56 * 60 * 60 * 1000).toISOString(), { includeWeekdays: true, showTime: false }),
    },
    {
      label: `formatRelativeDate(utcDate, { weekdayOnly: true })`,
      comment: "Вівторок",
      value: formatRelativeDate(new Date(now.getTime() - 85 * 60 * 60 * 1000).toISOString(), { weekdayOnly: true }),
    },
    {
      label: `formatRelativeDate(utcDate, { weekdayOnly: true, shortWeekday: true })`,
      comment: "Вівторок",
      value: formatRelativeDate(new Date(now.getTime() - 85 * 60 * 60 * 1000).toISOString(), { weekdayOnly: true, shortWeekday: true }),
    },
  ];

  return (
    <Card classNames={{body: "p-4"}}>
		<CardBody>
			<h3 className="text-lg font-semibold text-gray-900 mb-4">Функція форматування дати <span className="font-normal font-mono text-sm bg-neutral-100 rounded px-2 py-1">formatRelativeDate(date, {`{options?}`})</span></h3>
			<Table aria-label="Demonstration of formatRelativeDate function" 
				classNames={{
					wrapper:
					  "min-h-80 p-0 pb-1 shadow-none bg-transparent rounded-none",
					th: ["first:rounded-s-md", "last:rounded-e-md"],
				}}>
				<TableHeader>
					<TableColumn key="function">Функція форматування дати</TableColumn>
					<TableColumn key="format">Приклад</TableColumn>
				</TableHeader>
				<TableBody items={demoDates}>
					{(item) => (
						item.isSeparator
						? (
							<TableRow key="separator">
								<TableCell colSpan={2} className="py-2 px-0">
									<div className="w-full flex items-center">
										<div className="flex-grow border-t border-gray-200" />
										<span className="mx-3 text-gray-400 text-xs select-none">✦</span>
										<div className="flex-grow border-t border-gray-200" />
									</div>
								</TableCell>
							</TableRow>
						)
						: (
							<TableRow key={item.label}>
								<TableCell>
									<code>{item.label}</code>
								</TableCell>
								<TableCell>{item.value}</TableCell>
							</TableRow>
						)
					)}
				</TableBody>
			</Table>
		</CardBody>
	</Card>
  );
}
