/** Floating tooltip of the invoices charts (same look as the sales report chart). */

interface TooltipEntry {
  value: number;
  color: string;
  name: string;
}

interface Props {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatValue: (value: number, name: string) => string;
  /** Optional second line under the title, e.g. the period. */
  subtitle?: string;
}

export function InvoicesChartTooltip({ active, payload, label, formatValue, subtitle }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg max-w-xs">
      <p className="font-semibold text-gray-900">{label}</p>
      {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
      <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
        {payload.map((entry, index) => (
          <div key={`${entry.name}-${index}`} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-sm font-medium truncate max-w-32">{entry.name}</span>
            </div>
            <span className="text-sm font-bold" style={{ color: entry.color }}>
              {formatValue(entry.value, entry.name)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
