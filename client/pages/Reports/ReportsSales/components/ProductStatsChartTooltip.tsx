interface ProductStatsChartTooltipEntry {
  value: number;
  color: string;
  name: string;
  payload: {
    date: string;
    fullDate: string;
  };
}

interface ProductStatsChartTooltipProps {
  active?: boolean;
  payload?: ProductStatsChartTooltipEntry[];
}

export function ProductStatsChartTooltip({
  active,
  payload,
}: ProductStatsChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload;

  if (!data) {
    return null;
  }

  return (
    <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg max-w-xs">
      <p className="font-semibold text-gray-900">{data.date}</p>
      <p className="text-sm text-gray-600">{data.fullDate}</p>
      <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
        {payload
          .slice()
          .sort((first, second) => second.value - first.value)
          .map((entry, index) => (
            <div key={`${entry.name}-${index}`} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm font-medium truncate max-w-32">
                  {entry.name}
                </span>
              </div>
              <span className="text-sm font-bold" style={{ color: entry.color }}>
                {entry.value}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}