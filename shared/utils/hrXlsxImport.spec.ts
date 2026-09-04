import { describe, expect, it } from 'vitest';
import { hrEmployeeImportKey, hrEmploymentImportKey } from '../types/hr';
import {
  extractCardDigits,
  isHrImportGroupHeader,
  mapHrImportEmployer,
  parseHrImportDayCell,
  parseHrImportFio,
  parseHrImportRate,
  parseHrTimesheetWorkbook,
} from './hrXlsxImport';

function dayHeaderRow(startCol: number): unknown[] {
  const row: unknown[] = [];
  for (let day = 1; day <= 31; day += 1) {
    row[startCol + day - 1] = day;
  }
  return row;
}

describe('hrXlsxImport — імена та ключі', () => {
  it('прибирає (С)/(П), картку і примітки з ПІБ', () => {
    const parsed = parseHrImportFio(
      '(П)Катя Цибуля 5363 5420 9916 0534 (новенькие)',
    );
    expect(parsed?.marker).toBe('П');
    expect(parsed?.lastName).toBe('Цибуля');
    expect(parsed?.firstName).toBe('Катя');
    expect(parsed?.cardDigits).toBe('5363542099160534');
    expect(parsed?.notes).toContain('новенькие');
    expect(parsed?.cardDigits && /5363/.test(`${parsed.lastName}${parsed.firstName}`)).toBe(false);
  });

  it('незакрита дужка йде в примітку, не в прізвище', () => {
    const parsed = parseHrImportFio('(С)Альона (комплектувальник0');
    expect(parsed?.firstName).toBe('Альона');
    expect(parsed?.lastName).toBe('Альона');
    expect(parsed?.notes.join(' ')).toMatch(/комплектувальник/);
  });

  it('три частини з по-батькові → прізвище|імʼя|по-батькові', () => {
    const parsed = parseHrImportFio('(П) Інбулаєва Юлія Сергіївна');
    expect(parsed?.lastName).toBe('Інбулаєва');
    expect(parsed?.firstName).toBe('Юлія');
    expect(parsed?.middleName).toBe('Сергіївна');
    expect(hrEmployeeImportKey(parsed!.lastName, parsed!.firstName, parsed!.middleName)).toBe(
      'інбулаєва|юлія|сергіївна',
    );
  });

  it('Аліна Болдова і Болдова Аліна дають той самий канонічний порядок', () => {
    const a = parseHrImportFio('(С)Аліна Болдова');
    const b = parseHrImportFio('Болдова Аліна');
    expect(a?.lastName).toBe('Болдова');
    expect(a?.firstName).toBe('Аліна');
    expect(b?.lastName).toBe('Болдова');
    expect(b?.firstName).toBe('Аліна');
  });

  it('Петрик Марина і Марина Петрик зливаються за ключем', () => {
    const a = parseHrImportFio('Петрик Марина');
    const b = parseHrImportFio('(С)Марина Петрик');
    expect(hrEmployeeImportKey(a!.lastName, a!.firstName, a!.middleName)).toBe(
      hrEmployeeImportKey(b!.lastName, b!.firstName, b!.middleName),
    );
    expect(hrEmployeeImportKey(a!.lastName, a!.firstName, a!.middleName)).toBe('петрик|марина');
  });

  it('витягує картку, не лишаючи цифри в тексті', () => {
    const { text, digits } = extractCardDigits('данило       5168752114782017');
    expect(digits).toBe('5168752114782017');
    expect(text.toLowerCase()).toContain('данило');
    expect(text).not.toMatch(/\d{8}/);
  });
});

describe('hrXlsxImport — клітинки, ставка, юрособа', () => {
  it('парсить години і коди дня', () => {
    expect(parseHrImportDayCell(8)).toEqual({ kind: 'work', hours: '8.00' });
    expect(parseHrImportDayCell(7.5)).toEqual({ kind: 'work', hours: '7.50' });
    expect(parseHrImportDayCell('В')).toEqual({ kind: 'В', hours: null });
    expect(parseHrImportDayCell('тн')).toEqual({ kind: 'ТН', hours: null });
    expect(parseHrImportDayCell('п')).toEqual({ kind: 'Пр', hours: null });
    expect(parseHrImportDayCell('звільнення')).toEqual({ skip: 'dismissal_note' });
    expect(parseHrImportDayCell(null)).toBeNull();
  });

  it('ставку бере лише з явних сум, не вгадує 500–999', () => {
    expect(parseHrImportRate(22000)).toEqual({ kind: 'salary', amount: '22000.00' });
    expect(parseHrImportRate('90 грн/год')).toEqual({ kind: 'hourly', amount: '90.00' });
    expect(parseHrImportRate(750)).toBeNull();
  });

  it('мапить ФОП/ТОВ/нештатні з конкретними кодами роботодавців', () => {
    const fop = mapHrImportEmployer('ФОП Бубнов С.В.', 'official_salary');
    expect(fop.kind).toBe('fop');
    expect(fop.payGroup).toBe('official_salary');
    expect(fop.unnamed).toBe(false);
    expect(fop.legalEntityName).toBe('ФОП Бубнов С.В.');
    expect(fop.legalEntityCode).toMatch(/^fop_/);

    expect(mapHrImportEmployer('ТОВ "Нова кухня"', 'official_salary').legalEntityCode).toMatch(/^tov_/);
    expect(mapHrImportEmployer('не штантні/готівка', 'hourly')).toEqual({
      legalEntityCode: expect.stringMatching(/^unofficial_cash_/),
      legalEntityName: 'не штантні/готівка',
      kind: 'unofficial_cash',
      payGroup: 'unofficial_cash',
      unnamed: false,
    });
    expect(isHrImportGroupHeader('По годинно')).toBe('hourly');
    expect(isHrImportGroupHeader('Офіційні')).toBe('official_salary');
  });
});

describe('hrXlsxImport — аркуш-фікстура', () => {
  it('збирає людей, зайнятість і клітинки; легенду пропускає', () => {
    const jan: unknown[][] = [];
    jan[3] = [];
    jan[3][15] = 'Січень';
    jan[3][20] = 2026;
    jan[5] = ['№ з/п', 'Прізвище І.П.', 'Роботодавець', '21 Робочий день (Січень)'];
    jan[6] = dayHeaderRow(3);
    jan[8] = [];
    jan[8][1] = '(С) Прокопенко Олена';
    jan[8][2] = 'ФОП Бубнов С.В.';
    jan[8][7] = 8;
    jan[8][8] = 'В';
    jan[9] = [];
    jan[9][1] = 'Марина Петрик';
    jan[9][2] = 'ТОВ "Нова кухня"';
    jan[9][7] = 8;
    jan[10] = [];
    jan[10][1] = 'Петрик Марина';
    jan[10][2] = 'ТОВ "Нова кухня"';
    jan[10][9] = 7.5;
    jan[11] = [];
    jan[11][1] = '( П ) - Прогул';

    const sep: unknown[][] = [];
    sep[3] = [];
    sep[3][16] = 'Вересень';
    sep[3][21] = 2026;
    sep[5] = ['№ з/п', 'Прізвище І.П.', '', 'Роботодавець', '22 Робочі дні'];
    sep[6] = dayHeaderRow(4);
    sep[7] = [];
    sep[7][2] = 'Ставка\n(розмір)';
    sep[8] = [];
    sep[8][1] = 'Офіційні';
    sep[9] = [];
    sep[9][1] = '(С) Прокопенко Олена';
    sep[9][2] = 22000;
    sep[9][3] = 'ФОП Бубнов С.В.';
    sep[9][4] = 8;

    const bundle = parseHrTimesheetWorkbook([
      { name: 'Січень01', rows: jan },
      { name: 'Вересень 09', rows: sep },
    ]);

    const prokopenko = bundle.preview.employees.find((item) => item.employeeKey === 'прокопенко|олена');
    expect(prokopenko).toBeTruthy();
    expect(prokopenko?.months).toEqual(expect.arrayContaining(['2026-01', '2026-09']));
    expect(prokopenko?.hasRate).toBe(true);

    const petryk = bundle.preview.employees.find((item) => item.employeeKey === 'петрик|марина');
    expect(petryk).toBeTruthy();
    expect(petryk?.entryCount).toBe(2);

    const employment = bundle.preview.employments.find((item) => item.employeeKey === 'прокопенко|олена');
    expect(employment?.legalEntityCode).toMatch(/^fop_/);
    expect(employment?.legalEntityName).toBe('ФОП Бубнов С.В.');
    expect(employment?.payGroup).toBe('official_salary');
    expect(employment?.validFrom).toBe('2026-01-01');
    expect(employment?.rateAmount).toBe('22000.00');
    expect(employment?.employmentImportKey).toBe(
      hrEmploymentImportKey('прокопенко|олена', employment!.legalEntityCode, 'official_salary', '2026-01-01'),
    );

    expect(bundle.preview.skipped.some((item) => item.reason === 'legend_or_header')).toBe(true);
    const work = bundle.personMonths
      .flatMap((row) => row.entries)
      .find((entry) => entry.date === '2026-01-05' && entry.kind === 'work');
    expect(work?.hours).toBe('8.00');
  });
});
