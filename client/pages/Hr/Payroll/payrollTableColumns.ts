import type { HrPayrollLineDto, HrPayrollPeriodMode, HrTimesheetWeekDto } from '@shared/types/hr';
import type { PayrollTableBuilderConfig } from '@shared/types/tableBuilder';

export interface PayrollExtraColumn {
  id: string;
  label: string;
  width: number;
  getRaw: (line: HrPayrollLineDto) => string;
}

const COL_W = 96;

function esvAmountOnly(line: HrPayrollLineDto): number {
  const fromBreakdown = (line.taxBreakdown ?? [])
    .filter((item) => item.code === 'esv')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  if (fromBreakdown > 0) return fromBreakdown;
  return Number(line.esvAmount ?? 0);
}

function employerTaxTotal(line: HrPayrollLineDto): number {
  const fromBreakdown = (line.taxBreakdown ?? [])
    .filter((item) => item.payer === 'employer')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  if (fromBreakdown > 0) return fromBreakdown;
  return Number(line.esvAmount ?? 0);
}

function employeeTaxTotal(line: HrPayrollLineDto): number {
  const fromBreakdown = (line.taxBreakdown ?? [])
    .filter((item) => item.payer === 'employee')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  if (fromBreakdown > 0) return fromBreakdown;
  return Number(line.taxAmount ?? 0);
}

export function lineHasTaxBreakdown(line: HrPayrollLineDto): boolean {
  return (line.taxBreakdown?.length ?? 0) > 0;
}

export function lineHasEmployeeTaxes(line: HrPayrollLineDto): boolean {
  return (line.taxBreakdown ?? []).some((item) => item.payer === 'employee' && Number(item.amount) > 0);
}

/** Чи показувати податкові колонки окремо (не включені в суми періодів). */
export function shouldShowTaxColumns(line: HrPayrollLineDto, config: PayrollTableBuilderConfig): boolean {
  if (!config.taxesSeparate) return false;
  if (!lineHasTaxBreakdown(line)) return false;
  return true;
}

export function adjustWeekAmountsForDisplay(
  line: HrPayrollLineDto,
  weeks: HrTimesheetWeekDto[],
  config: PayrollTableBuilderConfig,
): Record<string, string> {
  const weekMap = new Map(line.weekAmounts.map((item) => [item.weekId, item]));
  const showTaxCols = shouldShowTaxColumns(line, config);
  const periodTotal = line.weekAmounts.reduce((sum, item) => sum + Number(item.toPay), 0);
  const employerTaxes = employerTaxTotal(line);
  const taxToFold = showTaxCols ? 0 : employerTaxes;

  const result: Record<string, string> = {};
  for (const week of weeks) {
    const cell = weekMap.get(week.id);
    const raw = Number(cell?.toPay ?? 0);
    if (!showTaxCols && taxToFold > 0 && periodTotal > 0) {
      const adjusted = raw + (taxToFold * raw) / periodTotal;
      result[week.id] = adjusted > 0 ? adjusted.toFixed(2) : '';
    } else {
      result[week.id] = cell?.toPay ?? '';
    }
  }
  return result;
}

export function lineGrandTotalForDisplay(
  line: HrPayrollLineDto,
  config: PayrollTableBuilderConfig,
  periodMode: HrPayrollPeriodMode,
): string {
  if (periodMode === 'custom') {
    const totalWeek = line.weekAmounts.find((item) => item.weekId === 'total');
    return totalWeek?.toPay ?? line.toPayAmount;
  }

  const showTaxCols = shouldShowTaxColumns(line, config);
  const periods = line.weekAmounts.reduce((sum, item) => sum + Number(item.toPay), 0);
  const employeeTax = employeeTaxTotal(line);
  const employerTaxes = employerTaxTotal(line);
  const bonus = Number(line.bonusAmount || 0);

  if (showTaxCols) {
    return (periods + employeeTax + employerTaxes + bonus).toFixed(2);
  }

  return (periods + employerTaxes + employeeTax + bonus).toFixed(2);
}

function isPdfoMilitaryMerged(config: PayrollTableBuilderConfig): boolean {
  return config.merges.some(
    (merge) => merge.columnIds.includes('pdfo') && merge.columnIds.includes('military'),
  );
}

/** Довільний період: винести ЄСВ з колонки «Податки». */
export function isCustomEsvSeparate(config: PayrollTableBuilderConfig): boolean {
  return config.visibleColumns.esv;
}

function customTaxesWeekTotal(line: HrPayrollLineDto): number {
  const cell = line.weekAmounts.find((item) => item.weekId === 'taxes');
  return Number(cell?.toPay ?? 0);
}

function pdfoMilitaryTotal(line: HrPayrollLineDto): number {
  return Number(line.pdfoAmount ?? 0) + Number(line.militaryTaxAmount ?? 0);
}

/** Колонки таблиці для periodMode === custom з урахуванням TableBuilder. */
export function buildCustomDisplayWeeks(
  weeks: HrTimesheetWeekDto[],
  config: PayrollTableBuilderConfig,
): HrTimesheetWeekDto[] {
  if (!weeks.some((week) => week.id === 'taxes')) {
    return weeks;
  }

  const esvSeparate = isCustomEsvSeparate(config);
  const showBonus = config.visibleColumns.bonus;
  const mergedLabel =
    config.merges.find(
      (merge) => merge.columnIds.includes('pdfo') && merge.columnIds.includes('military'),
    )?.label ?? 'ПДФО+ВЗ';
  const pdfoMerged = isPdfoMilitaryMerged(config);

  const result: HrTimesheetWeekDto[] = [];
  for (const week of weeks) {
    if (week.id === 'taxes') {
      if (esvSeparate) {
        if (pdfoMerged && (config.visibleColumns.pdfo || config.visibleColumns.military)) {
          result.push({ ...week, id: 'pdfo-military', label: mergedLabel });
        } else {
          if (config.visibleColumns.pdfo) {
            result.push({ ...week, id: 'pdfo', label: 'ПДФО' });
          }
          if (config.visibleColumns.military) {
            result.push({ ...week, id: 'military', label: 'ВЗ' });
          }
        }
        result.push({ ...week, id: 'esv', label: 'ЄСВ' });
      } else {
        result.push(week);
      }
    } else if (week.id === 'bonus') {
      if (showBonus) result.push(week);
    } else {
      result.push(week);
    }
  }
  return result;
}

export function customWeekCellRaw(
  line: HrPayrollLineDto,
  weekId: string,
  config: PayrollTableBuilderConfig,
): string {
  if (weekId === 'esv') {
    const esv = esvAmountOnly(line);
    return esv > 0 ? esv.toFixed(2) : '';
  }
  if (weekId === 'pdfo-military') {
    const sum = pdfoMilitaryTotal(line);
    return sum > 0 ? sum.toFixed(2) : '';
  }
  if (weekId === 'pdfo') {
    const pdfo = Number(line.pdfoAmount ?? 0);
    return pdfo > 0 ? line.pdfoAmount : '';
  }
  if (weekId === 'military') {
    const military = Number(line.militaryTaxAmount ?? 0);
    return military > 0 ? line.militaryTaxAmount : '';
  }
  if (weekId === 'taxes') {
    const taxesTotal = customTaxesWeekTotal(line);
    if (taxesTotal <= 0) return '';
    return taxesTotal.toFixed(2);
  }

  const cell = line.weekAmounts.find((item) => item.weekId === weekId);
  return cell?.toPay ?? '';
}

export function buildPayrollExtraColumns(
  config: PayrollTableBuilderConfig,
  periodMode: HrPayrollPeriodMode,
): PayrollExtraColumn[] {
  if (periodMode === 'custom') {
    return [];
  }

  const columns: PayrollExtraColumn[] = [];

  if (config.taxesSeparate) {
    const mergedPdfo = config.merges.find(
      (merge) => merge.columnIds.includes('pdfo') && merge.columnIds.includes('military'),
    );

    if (mergedPdfo && (config.visibleColumns.pdfo || config.visibleColumns.military)) {
      columns.push({
        id: mergedPdfo.id,
        label: mergedPdfo.label,
        width: COL_W,
        getRaw: (line) => {
          if (!shouldShowTaxColumns(line, config)) return '';
          const pdfo = Number(line.pdfoAmount ?? 0);
          const military = Number(line.militaryTaxAmount ?? 0);
          const sum = pdfo + military;
          return sum > 0 ? sum.toFixed(2) : '';
        },
      });
    } else {
      if (config.visibleColumns.pdfo) {
        columns.push({
          id: 'pdfo',
          label: 'ПДФО',
          width: COL_W,
          getRaw: (line) => {
            if (!shouldShowTaxColumns(line, config)) return '';
            return Number(line.pdfoAmount ?? 0) > 0 ? line.pdfoAmount : '';
          },
        });
      }
      if (config.visibleColumns.military) {
        columns.push({
          id: 'military',
          label: 'ВЗ',
          width: COL_W,
          getRaw: (line) => {
            if (!shouldShowTaxColumns(line, config)) return '';
            return Number(line.militaryTaxAmount ?? 0) > 0 ? line.militaryTaxAmount : '';
          },
        });
      }
    }

    if (config.visibleColumns.esv) {
      columns.push({
        id: 'esv',
        label: 'ЄСВ',
        width: COL_W,
        getRaw: (line) => {
          if (!shouldShowTaxColumns(line, config)) return '';
          const esv = esvAmountOnly(line);
          return esv > 0 ? esv.toFixed(2) : '';
        },
      });
    }

    if (config.visibleColumns.bonus) {
      columns.push({
        id: 'bonus',
        label: 'Премії',
        width: COL_W,
        getRaw: (line) => (Number(line.bonusAmount ?? 0) > 0 ? line.bonusAmount : ''),
      });
    }
  }

  if (config.visibleColumns.total) {
    columns.push({
      id: 'total',
      label: 'Разом',
      width: COL_W,
      getRaw: (line) => lineGrandTotalForDisplay(line, config, periodMode),
    });
  }

  return columns;
}
