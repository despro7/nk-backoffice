import type { TechCardMassPrecision } from '../../ProductsUtils';

export function buildTechCardFileName(productName: string, extension: string): string {
  const safeName = productName
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  const stamp = new Date().toISOString().slice(0, 10);
  return `Техкарта_${safeName || 'продукт'}_${stamp}.${extension}`;
}

export function techCardExcelMassNumberFormat(precision: TechCardMassPrecision): string {
  if (precision === 'auto') return '#,##0.000';
  if (precision === 0) return '#,##0';
  return `#,##0.${'0'.repeat(precision)}`;
}
