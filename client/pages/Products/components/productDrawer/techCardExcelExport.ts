import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { pluralize } from '@/lib/formatUtils';
import type { TechCardResult } from '../../ProductsUtils';
import { buildTechCardFileName, techCardExcelMassNumberFormat } from './techCardExportShared';

const EXCEL_COL_COUNT = 5;
/** 1-based: рядок заголовків таблиці */
const EXCEL_HEADER_ROW = 4;

function setSheetCell(
  worksheet: XLSX.WorkSheet,
  row: number,
  col: number,
  value: string | number,
  numFmt?: string
): void {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  if (typeof value === 'number') {
    worksheet[address] = numFmt ? { t: 'n', v: value, z: numFmt } : { t: 'n', v: value };
    return;
  }
  worksheet[address] = { t: 's', v: value };
}

export async function exportTechCardExcel(
  productName: string,
  specQty: number,
  portions: number,
  techCard: TechCardResult
): Promise<void> {
  const massFormat = techCardExcelMassNumberFormat(techCard.massPrecision);
  const recipeMassFormat = '#,##0.000';
  const worksheet: XLSX.WorkSheet = {};
  const headerRowIdx = EXCEL_HEADER_ROW - 1;
  const firstDataRowIdx = headerRowIdx + 1;

  setSheetCell(worksheet, 0, 0, `Техкарта «${productName}»`);
  setSheetCell(
    worksheet,
    1,
    0,
    `Порцій для варки: ${portions} · Рецепт на: ${specQty} ${pluralize(specQty, 'порцію', 'порції', 'порцій')}`
  );

  const headers = [
    'Інгредієнт',
    'Вага за рецептом',
    'Втрати',
    'Маса нетто, кг',
    'Маса брутто, кг',
  ];
  headers.forEach((header, col) => setSheetCell(worksheet, headerRowIdx, col, header));

  techCard.rows.forEach((row, index) => {
    const rowIdx = firstDataRowIdx + index;
    setSheetCell(worksheet, rowIdx, 0, row.nameDisplay);
    setSheetCell(worksheet, rowIdx, 1, row.recipeDisplay);
    setSheetCell(worksheet, rowIdx, 2, row.lossDisplay);

    if (row.massKgNetTotal != null && Number.isFinite(row.massKgNetTotal)) {
      setSheetCell(worksheet, rowIdx, 3, row.massKgNetTotal, massFormat);
    } else {
      setSheetCell(worksheet, rowIdx, 3, '—');
    }

    if (row.massKgGrossTotal != null && Number.isFinite(row.massKgGrossTotal)) {
      setSheetCell(worksheet, rowIdx, 4, row.massKgGrossTotal, massFormat);
    } else {
      setSheetCell(worksheet, rowIdx, 4, '—');
    }
  });

  const totalsRowIdx = firstDataRowIdx + techCard.rows.length;
  setSheetCell(worksheet, totalsRowIdx, 0, 'Разом');
  if (techCard.totalRecipeMassKg != null && Number.isFinite(techCard.totalRecipeMassKg)) {
    setSheetCell(worksheet, totalsRowIdx, 1, techCard.totalRecipeMassKg, recipeMassFormat);
  }
  if (techCard.totalNetMassKg != null && Number.isFinite(techCard.totalNetMassKg)) {
    setSheetCell(worksheet, totalsRowIdx, 3, techCard.totalNetMassKg, massFormat);
  } else {
    setSheetCell(worksheet, totalsRowIdx, 3, '—');
  }
  if (techCard.totalGrossMassKg != null && Number.isFinite(techCard.totalGrossMassKg)) {
    setSheetCell(worksheet, totalsRowIdx, 4, techCard.totalGrossMassKg, massFormat);
  } else {
    setSheetCell(worksheet, totalsRowIdx, 4, '—');
  }

  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: EXCEL_COL_COUNT - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: EXCEL_COL_COUNT - 1 } },
  ];
  worksheet['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
  worksheet['!views'] = [
    {
      state: 'frozen',
      xSplit: 0,
      ySplit: EXCEL_HEADER_ROW,
      topLeftCell: 'A5',
      activePane: 'bottomLeft',
    },
  ];

  if (techCard.rows.length > 0) {
    worksheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: headerRowIdx, c: 0 },
        e: { r: totalsRowIdx - 1, c: EXCEL_COL_COUNT - 1 },
      }),
    };
  }

  worksheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: totalsRowIdx, c: EXCEL_COL_COUNT - 1 },
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Техкарта');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    buildTechCardFileName(productName, 'xlsx')
  );
}
