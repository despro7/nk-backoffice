/** Іконка lucide за типом документа Dilovod (за текстом назви). */
export function resolveDocumentIconName(label: string): string {
  const text = label.trim().toLowerCase();
  if (!text) return 'file-text';
  if (text.includes('відвантаж')) return 'truck';
  if (text.includes('комплектац')) return 'package';
  if (text.includes('розкомплект') || text.includes('розукомплект')) return 'package-minus';
  if (text.includes('повернен')) return 'undo-2';
  if (text.includes('переміщен')) return 'arrow-left-right';
  if (text.includes('оприбуткуван')) return 'package-plus';
  if (text.includes('списан')) return 'trash-2';
  return 'file-text';
}

/** Колір іконки за типом документа Dilovod. */
export function resolveDocumentIconClass(label: string): string {
  const text = label.trim().toLowerCase();
  if (!text) return 'text-default-400';
  if (text.includes('відвантаж')) return 'text-success-500';
  if (text.includes('переміщен')) return 'text-amber-500';
  if (text.includes('комплектац')) return 'text-blue-500';
  if (text.includes('повернен')) return 'text-danger-500';
  if (text.includes('розкомплект') || text.includes('розукомплект')) return 'text-purple-500';
  if (text.includes('оприбуткуван')) return 'text-cyan-500';
  if (text.includes('списан')) return 'text-danger-500';
  return 'text-default-400';
}
