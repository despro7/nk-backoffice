interface RowIndexCellProps {
  index: number;
  className?: string;
}

/** Нумерація data-рядків (index + 1 у відфільтрованому списку). */
export function RowIndexCell({ index, className = '' }: RowIndexCellProps) {
  return (
    <td className={`px-2 py-2.5 text-center text-xs text-default-400 tabular-nums ${className}`}>
      {index + 1}
    </td>
  );
}
