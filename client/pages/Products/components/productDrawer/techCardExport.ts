import { pdf, Font } from '@react-pdf/renderer';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { TechCardMassPrecision, TechCardResult } from '../../ProductsUtils';
import { TechCardPdfDocument } from './TechCardPdfDocument';
import { pluralize } from '@/lib/formatUtils';

let fontsRegistered = false;

const EXCEL_COL_COUNT = 5;
/** 1-based: рядок заголовків таблиці */
const EXCEL_HEADER_ROW = 4;

function ensureTechCardPdfFonts(): void {
  if (fontsRegistered) return;
  Font.register({
    family: 'Arial',
    fonts: [
      { src: '/fonts/ArialRegular.ttf', fontWeight: 400 },
      { src: '/fonts/ArialBold.ttf', fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

function buildFileName(productName: string, extension: string): string {
  const safeName = productName
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  const stamp = new Date().toISOString().slice(0, 10);
  return `Техкарта_${safeName || 'продукт'}_${stamp}.${extension}`;
}

function excelMassNumberFormat(precision: TechCardMassPrecision): string {
  if (precision === 'auto') return '#,##0.000';
  if (precision === 0) return '#,##0';
  return `#,##0.${'0'.repeat(precision)}`;
}

async function renderTechCardPdfBlob(
  productName: string,
  specQty: number,
  portions: number,
  techCard: TechCardResult
): Promise<Blob> {
  ensureTechCardPdfFonts();
  return pdf(TechCardPdfDocument({ productName, specQty, portions, techCard })).toBlob();
}

function printPdfInBrowser(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 500);
    };
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } else {
    URL.revokeObjectURL(url);
    throw new Error('Браузер заблокував вікно друку');
  }
}

export async function exportTechCardPdf(
  productName: string,
  specQty: number,
  portions: number,
  techCard: TechCardResult
): Promise<void> {
  const blob = await renderTechCardPdfBlob(productName, specQty, portions, techCard);
  saveAs(blob, buildFileName(productName, 'pdf'));
}

export async function printTechCardPdf(
  productName: string,
  specQty: number,
  portions: number,
  techCard: TechCardResult
): Promise<void> {
  const blob = await renderTechCardPdfBlob(productName, specQty, portions, techCard);
  printPdfInBrowser(blob);
}

export async function exportTechCardExcel(
  productName: string,
  specQty: number,
  portions: number,
  techCard: TechCardResult
): Promise<void> {
  const massFormat = excelMassNumberFormat(techCard.massPrecision);
  const recipeMassFormat = '#,##0.000';

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Техкарта', {
    views: [{ state: 'frozen', ySplit: EXCEL_HEADER_ROW, activeCell: 'A5' }],
  });

  worksheet.columns = [
    { width: 42 },
    { width: 18 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
  ];

  worksheet.mergeCells(1, 1, 1, EXCEL_COL_COUNT);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = `Техкарта «${productName}»`;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { vertical: 'middle', wrapText: true };

  worksheet.mergeCells(2, 1, 2, EXCEL_COL_COUNT);
  const metaCell = worksheet.getCell(2, 1);
  metaCell.value = `Порцій для варки: ${portions} · Рецепт на: ${specQty} ${pluralize(specQty, 'порцію', 'порції', 'порцій')}`;
  metaCell.font = { size: 11 };
  metaCell.alignment = { vertical: 'middle' };

  const headerRow = worksheet.getRow(EXCEL_HEADER_ROW);
  headerRow.values = [
    'Інгредієнт',
    'Вага за рецептом',
    'Втрати',
    'Маса нетто, кг',
    'Маса брутто, кг',
  ];
  headerRow.font = { bold: true };
  headerRow.eachCell((cell, colNumber) => {
    cell.alignment = {
      horizontal: colNumber === 2 ? 'left' : colNumber >= 3 ? 'right' : 'left',
      vertical: 'middle',
    };
  });

  const firstDataRow = EXCEL_HEADER_ROW + 1;
  techCard.rows.forEach((row, index) => {
    const excelRow = worksheet.getRow(firstDataRow + index);
    excelRow.getCell(1).value = row.nameDisplay;
    excelRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

    excelRow.getCell(2).value = row.recipeDisplay;
    excelRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };

    excelRow.getCell(3).value = row.lossDisplay;
    excelRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

    const netCell = excelRow.getCell(4);
    if (row.massKgNetTotal != null && Number.isFinite(row.massKgNetTotal)) {
      netCell.value = row.massKgNetTotal;
      netCell.numFmt = massFormat;
    } else {
      netCell.value = '—';
    }
    netCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const grossCell = excelRow.getCell(5);
    if (row.massKgGrossTotal != null && Number.isFinite(row.massKgGrossTotal)) {
      grossCell.value = row.massKgGrossTotal;
      grossCell.numFmt = massFormat;
    } else {
      grossCell.value = '—';
    }
    grossCell.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  const totalsRowIndex = firstDataRow + techCard.rows.length;
  const totalsRow = worksheet.getRow(totalsRowIndex);
  totalsRow.font = { bold: true };

  totalsRow.getCell(1).value = 'Разом';
  totalsRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  const recipeTotalCell = totalsRow.getCell(2);
  if (techCard.totalRecipeMassKg != null && Number.isFinite(techCard.totalRecipeMassKg)) {
    recipeTotalCell.value = techCard.totalRecipeMassKg;
    recipeTotalCell.numFmt = recipeMassFormat;
  }
  recipeTotalCell.alignment = { horizontal: 'left', vertical: 'middle' };

  totalsRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

  const netTotalCell = totalsRow.getCell(4);
  if (techCard.totalNetMassKg != null && Number.isFinite(techCard.totalNetMassKg)) {
    netTotalCell.value = techCard.totalNetMassKg;
    netTotalCell.numFmt = massFormat;
  } else {
    netTotalCell.value = '—';
  }
  netTotalCell.alignment = { horizontal: 'right', vertical: 'middle' };

  const grossTotalCell = totalsRow.getCell(5);
  if (techCard.totalGrossMassKg != null && Number.isFinite(techCard.totalGrossMassKg)) {
    grossTotalCell.value = techCard.totalGrossMassKg;
    grossTotalCell.numFmt = massFormat;
  } else {
    grossTotalCell.value = '—';
  }
  grossTotalCell.alignment = { horizontal: 'right', vertical: 'middle' };

  if (techCard.rows.length > 0) {
    worksheet.autoFilter = {
      from: { row: EXCEL_HEADER_ROW, column: 1 },
      to: { row: totalsRowIndex - 1, column: EXCEL_COL_COUNT },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    buildFileName(productName, 'xlsx')
  );
}
