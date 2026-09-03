import {
  HR_PAY_GROUPS,
  hrEmployeeImportKey,
  hrEmployeeImportKeyCandidates,
  hrEmploymentImportKey,
  type HrPayGroup,
  type HrPayTermsKind,
  type HrTimesheetKind,
  type HrXlsxImportCountsDto,
  type HrXlsxImportEmployeePreviewDto,
  type HrXlsxImportEmploymentPreviewDto,
  type HrXlsxImportPreviewDto,
  type HrXlsxImportSkipDto,
} from '../types/hr.js';
import { daysInMonth, formatYearMonth } from './hrTimesheetCalendar.js';
import { parseTimesheetHours } from './hrTimesheetCell.js';

export interface HrXlsxSheetInput {
  name: string;
  rows: unknown[][];
}

export interface HrXlsxParsedName {
  lastName: string;
  firstName: string;
  middleName: string | null;
  marker: 'С' | 'П' | null;
  cardDigits: string | null;
  notes: string[];
}

export interface HrXlsxParsedEntry {
  date: string;
  kind: HrTimesheetKind;
  hours: string | null;
}

export interface HrXlsxParsedRate {
  kind: HrPayTermsKind;
  amount: string;
}

export interface HrXlsxPersonMonth {
  sheet: string;
  year: number;
  month: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  employeeKey: string;
  altKeys: string[];
  payGroup: HrPayGroup;
  legalEntityCode: string;
  employerRaw: string;
  cardDigits: string | null;
  notes: string | null;
  rate: HrXlsxParsedRate | null;
  entries: HrXlsxParsedEntry[];
  unnamedEmployer: boolean;
}

export interface HrXlsxParseBundle {
  preview: HrXlsxImportPreviewDto;
  personMonths: HrXlsxPersonMonth[];
  /** canonicalKey → person months (already merged by name keys) */
  byEmployeeKey: Map<string, HrXlsxPersonMonth[]>;
}

const MONTH_NAMES: Record<string, number> = {
  січень: 1,
  лютий: 2,
  березень: 3,
  квітень: 4,
  травень: 5,
  червень: 6,
  липень: 7,
  серпень: 8,
  вересень: 9,
  жовтень: 10,
  листопад: 11,
  грудень: 12,
};

const GIVEN_NAMES = new Set(
  [
    'олена', 'марина', 'аліна', 'алина', 'алла', 'юлія', 'юлия', 'вікторія', 'виктория', 'вика',
    'сергій', 'сергей', 'іван', 'иван', 'микита', 'катерина', 'катя', 'ольга', 'анна', 'павло',
    'дмитро', 'оксана', 'дарина', 'максим', 'микола', 'данило', 'владислав', 'ярослав', 'євгенія',
    'евгения', 'альона', 'алена', 'татьяна', 'tetiana', 'кристина', 'олеся', 'марк', 'володимир',
    'владимир', 'світлана', 'светлана', 'зоя', 'лілія', 'лилия', 'юрій', 'юрий', 'оріна', 'орина',
    'микита', 'павел',
  ].map((n) => n.toLocaleLowerCase('uk')),
);

const SURNAME_RE = /(енко|єнко|ук|юк|чук|чак|ський|цький|ська|цька|ов$|ев$|ёв$|ін$|ын$|ян$|ова$|ева$|іна$|ина$|ман$|берг$)$/i;

const LEGEND_RE =
  /прогул|робочий день|вихідн|святков|звільнен|відключення|відпустка|тимчасова непрацездат|оплачено|вихідна|без збережен/i;

const GROUP_HEADER_RE = /^(ставка|офіційн|по\s*годин|не\s*офіційн|підробіток|нештатн)/i;

const PATRONYMIC_RE = /(івна|ївна|овна|ична|ович|евич|йович|ич)$/i;

function cellStr(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, ' ').trim();
}

function isPayGroup(value: string): value is HrPayGroup {
  return (HR_PAY_GROUPS as readonly string[]).includes(value);
}

export function extractCardDigits(raw: string): { text: string; digits: string | null } {
  const match = raw.match(/(?:\d[\s-]*){13,19}/);
  if (!match) return { text: raw, digits: null };
  const digits = match[0].replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return { text: raw, digits: null };
  const text = `${raw.slice(0, match.index)}${raw.slice((match.index ?? 0) + match[0].length)}`.replace(/\s+/g, ' ').trim();
  return { text, digits };
}

export function parseHrImportFio(raw: string): HrXlsxParsedName | null {
  let text = cellStr(raw);
  if (!text) return null;

  let marker: 'С' | 'П' | null = null;
  const markerMatch = text.match(/^\(\s*([СсПпSsPp])\s*\)\s*/);
  if (markerMatch) {
    const letter = markerMatch[1].toLocaleUpperCase('uk');
    marker = letter === 'П' || letter === 'P' ? 'П' : 'С';
    text = text.slice(markerMatch[0].length).trim();
  }

  const card = extractCardDigits(text);
  text = card.text;

  const notes: string[] = [];
  text = text
    .replace(/\(([^)]+)\)/g, (_whole, inner: string) => {
      const note = String(inner).trim();
      if (note && !/^[СсПпSsPp]$/.test(note)) notes.push(note);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  const unclosed = text.match(/\((.*)$/);
  if (unclosed) {
    const note = unclosed[1].trim();
    if (note) notes.push(note);
    text = text.slice(0, unclosed.index).trim();
  }

  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return null;

  let lastName = words[0];
  let firstName = words[1] ?? words[0];
  let middleName: string | null = words.length >= 3 ? words.slice(2).join(' ') : null;

  if (words.length >= 3 && PATRONYMIC_RE.test(words[words.length - 1])) {
    lastName = words[0];
    firstName = words[1];
    middleName = words.slice(2).join(' ');
  } else if (words.length === 2) {
    const a = words[0].toLocaleLowerCase('uk');
    const b = words[1].toLocaleLowerCase('uk');
    const aGiven = GIVEN_NAMES.has(a);
    const bGiven = GIVEN_NAMES.has(b);
    const aSur = SURNAME_RE.test(a);
    const bSur = SURNAME_RE.test(b);
    if (aGiven && !bGiven) {
      firstName = words[0];
      lastName = words[1];
    } else if (bGiven && !aGiven) {
      lastName = words[0];
      firstName = words[1];
    } else if (aSur && !bSur) {
      lastName = words[0];
      firstName = words[1];
    } else if (bSur && !aSur) {
      firstName = words[0];
      lastName = words[1];
    } else {
      lastName = words[0];
      firstName = words[1];
    }
    middleName = null;
  } else if (words.length === 1) {
    lastName = words[0];
    firstName = words[0];
    middleName = null;
  }

  return {
    lastName,
    firstName,
    middleName,
    marker,
    cardDigits: card.digits,
    notes,
  };
}

export function isHrImportSkipName(raw: string): boolean {
  const text = cellStr(raw);
  if (!text) return true;
  if (/^\d+$/.test(text)) return true;
  if (LEGEND_RE.test(text)) return true;
  if (GROUP_HEADER_RE.test(text.replace(/^\(\s*[СсПп]\s*\)\s*/, ''))) return true;
  return false;
}

export function isHrImportGroupHeader(raw: string): HrPayGroup | null {
  const text = cellStr(raw).replace(/^\(\s*[СсПп]\s*\)\s*/, '');
  if (/не\s*офіційн.*готів|підробіток|не\s*штан?тн/i.test(text) && /готів|підробіт/i.test(text)) {
    return 'unofficial_cash';
  }
  if (/не\s*офіційн.*по\s*годин|по\s*годин/i.test(text)) return 'hourly';
  if (/^ставка$/i.test(text) || /^офіційн/i.test(text)) return 'official_salary';
  if (/не\s*офіційн/i.test(text)) return 'hourly';
  return null;
}

export function mapHrImportEmployer(
  raw: string,
  sectionGroup: HrPayGroup,
): { legalEntityCode: string; payGroup: HrPayGroup; unnamed: boolean } {
  const e = cellStr(raw).toLocaleLowerCase('uk').replace(/\\/g, '');
  if (/не\s*штан?тн/.test(e)) {
    return { legalEntityCode: 'unofficial_cash', payGroup: 'unofficial_cash', unnamed: false };
  }
  if (/(^|\s)тов(\s|$)/.test(e) || e.includes('нова кухня')) {
    return { legalEntityCode: 'tov', payGroup: sectionGroup, unnamed: false };
  }
  if (/(^|\s)фоп(\s|$)/.test(e)) {
    return { legalEntityCode: 'fop', payGroup: sectionGroup, unnamed: false };
  }
  if (sectionGroup === 'unofficial_cash') {
    return { legalEntityCode: 'unofficial_cash', payGroup: 'unofficial_cash', unnamed: !e };
  }
  if (sectionGroup === 'hourly') {
    return { legalEntityCode: 'unofficial_cash', payGroup: 'hourly', unnamed: true };
  }
  return { legalEntityCode: 'fop', payGroup: 'official_salary', unnamed: true };
}

export function parseHrImportRate(value: unknown): HrXlsxParsedRate | null {
  const text = cellStr(value);
  if (!text) return null;
  const hourly = text.match(/(\d+(?:[.,]\d+)?)\s*грн/i);
  if (hourly) {
    const amount = Number(hourly[1].replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { kind: 'hourly', amount: amount.toFixed(2) };
  }
  const num = Number(text.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num >= 1000 && num <= 500000) return { kind: 'salary', amount: num.toFixed(2) };
  if (num < 500) return { kind: 'hourly', amount: num.toFixed(2) };
  return null;
}

export function parseHrImportDayCell(value: unknown): { kind: HrTimesheetKind; hours: string | null } | { skip: string } | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return hoursFromNumber(value);
  }
  const text = cellStr(value);
  if (!text) return null;
  const asNum = Number(text.replace(',', '.').replace(/\s/g, ''));
  if (Number.isFinite(asNum) && /^-?\d/.test(text)) {
    return hoursFromNumber(asNum);
  }
  const compact = text.replace(/\s/g, '').replace(/\./g, '');
  const lower = compact.toLocaleLowerCase('uk');
  if (lower === 'в') return { kind: 'В', hours: null };
  if (lower === 'о') return { kind: 'О', hours: null };
  if (lower === 'тн') return { kind: 'ТН', hours: null };
  if (lower === 'н') return { kind: 'Н', hours: null };
  if (lower === 'св') return { kind: 'Св', hours: null };
  if (lower === 'пр' || lower === 'п') return { kind: 'Пр', hours: null };
  if (/звільн/i.test(text)) return { skip: 'dismissal_note' };
  return { skip: 'unknown_cell' };
}

function hoursFromNumber(n: number): { kind: HrTimesheetKind; hours: string | null } | { skip: string } {
  if (n <= 0 || n > 24) return { skip: 'hours_out_of_range' };
  const rounded = Math.round(n * 10) / 10;
  const parsed = parseTimesheetHours(String(rounded));
  if (!parsed) return { skip: 'hours_invalid' };
  return { kind: 'work', hours: Number(parsed).toFixed(2) };
}

function findYear(rows: unknown[][]): number | null {
  for (let r = 0; r < Math.min(rows.length, 8); r += 1) {
    const row = rows[r] ?? [];
    for (const cell of row) {
      const n = typeof cell === 'number' ? cell : Number(cellStr(cell));
      if (n >= 2024 && n <= 2035) return n;
    }
  }
  return null;
}

function findMonth(sheetName: string, rows: unknown[][]): number | null {
  const fromName = sheetName.match(/(\d{1,2})\s*$/);
  if (fromName) {
    const n = Number(fromName[1]);
    if (n >= 1 && n <= 12) return n;
  }
  const blob = `${sheetName} ${cellStr((rows[3] ?? [])[15])} ${cellStr((rows[3] ?? [])[16])}`.toLocaleLowerCase('uk');
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    if (blob.includes(name)) return num;
  }
  return null;
}

function detectLayout(rows: unknown[][]): {
  nameCol: number;
  employerCol: number;
  rateCol: number | null;
  dayCols: Map<number, number>;
} | null {
  let nameCol = 1;
  let employerCol = 2;
  let rateCol: number | null = null;
  const dayCols = new Map<number, number>();

  for (let r = 0; r < Math.min(rows.length, 10); r += 1) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      const t = cellStr(row[c]).toLocaleLowerCase('uk');
      if (t.includes('прізвище')) nameCol = c;
      if (t.includes('роботодавець')) employerCol = c;
      if (t.includes('ставка') && t.includes('розмір')) rateCol = c;
    }
  }

  for (let r = 0; r < Math.min(rows.length, 10); r += 1) {
    const row = rows[r] ?? [];
    const hits: { col: number; day: number }[] = [];
    for (let c = 0; c < row.length; c += 1) {
      const v = row[c];
      const n = typeof v === 'number' ? v : Number(cellStr(v));
      if (Number.isInteger(n) && n >= 1 && n <= 31) hits.push({ col: c, day: n });
    }
    const consecutive = hits.filter((item, i) => i === 0 || item.day === hits[i - 1].day + 1);
    if (consecutive.length >= 20) {
      for (const item of consecutive) dayCols.set(item.col, item.day);
      break;
    }
  }

  if (dayCols.size < 20) return null;
  if (rateCol == null && employerCol > nameCol + 1) {
    rateCol = nameCol + 1;
  }
  return { nameCol, employerCol, rateCol, dayCols };
}

class UnionFind {
  private parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    const p = this.parent.get(key)!;
    if (p !== key) {
      const root = this.find(p);
      this.parent.set(key, root);
      return root;
    }
    return key;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function markerToGroup(marker: 'С' | 'П' | null, section: HrPayGroup): HrPayGroup {
  if (marker === 'С') return 'official_salary';
  if (marker === 'П') return section === 'unofficial_cash' ? 'unofficial_cash' : 'hourly';
  return section;
}

export function parseHrTimesheetWorkbook(sheets: HrXlsxSheetInput[]): HrXlsxParseBundle {
  const skipped: HrXlsxImportSkipDto[] = [];
  const warnings: string[] = [];
  const personMonths: HrXlsxPersonMonth[] = [];
  let skippedCells = 0;
  let yearHint: number | null = null;

  for (const sheet of sheets) {
    const rows = sheet.rows;
    const year = findYear(rows) ?? 2026;
    yearHint = yearHint ?? year;
    const month = findMonth(sheet.name, rows);
    if (!month) {
      skipped.push({ sheet: sheet.name, reason: 'unknown_month', detail: 'Не вдалося визначити місяць аркуша' });
      continue;
    }
    const layout = detectLayout(rows);
    if (!layout) {
      skipped.push({ sheet: sheet.name, reason: 'unknown_layout', detail: 'Не знайдено колонки днів 1–31' });
      continue;
    }

    let section: HrPayGroup = 'official_salary';
    const dim = daysInMonth(year, month);

    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      const nameRaw = cellStr(row[layout.nameCol]);
      if (!nameRaw) continue;

      const group = isHrImportGroupHeader(nameRaw);
      if (group && isPayGroup(group)) {
        section = group;
        continue;
      }
      if (isHrImportSkipName(nameRaw)) {
        skipped.push({ sheet: sheet.name, reason: 'legend_or_header', detail: nameRaw.slice(0, 80) });
        continue;
      }

      const parsed = parseHrImportFio(nameRaw);
      if (!parsed) {
        skipped.push({ sheet: sheet.name, reason: 'empty_name', detail: nameRaw.slice(0, 80) });
        continue;
      }

      const employerRaw = cellStr(row[layout.employerCol]);
      const sectionGroup = markerToGroup(parsed.marker, section);
      const mapped = mapHrImportEmployer(employerRaw, sectionGroup);
      const rate = layout.rateCol != null ? parseHrImportRate(row[layout.rateCol]) : null;
      const employeeKey = hrEmployeeImportKey(parsed.lastName, parsed.firstName, parsed.middleName);
      const altKeys = hrEmployeeImportKeyCandidates(parsed.lastName, parsed.firstName, parsed.middleName);

      const entries: HrXlsxParsedEntry[] = [];
      for (const [col, day] of layout.dayCols) {
        if (day > dim) continue;
        const parsedCell = parseHrImportDayCell(row[col]);
        if (!parsedCell) continue;
        if ('skip' in parsedCell) {
          skippedCells += 1;
          skipped.push({
            sheet: sheet.name,
            reason: parsedCell.skip,
            detail: `${parsed.lastName} ${parsed.firstName} ${formatYearMonth(year, month)}-${String(day).padStart(2, '0')}`,
          });
          continue;
        }
        entries.push({
          date: `${formatYearMonth(year, month)}-${String(day).padStart(2, '0')}`,
          kind: parsedCell.kind,
          hours: parsedCell.hours,
        });
      }

      if (entries.length === 0 && !rate && !parsed.cardDigits) {
        skipped.push({
          sheet: sheet.name,
          reason: 'empty_row',
          detail: `${parsed.lastName} ${parsed.firstName}`.trim(),
        });
        continue;
      }

      if (mapped.unnamed) {
        warnings.push(
          `${parsed.lastName} ${parsed.firstName}: роботодавець «${employerRaw || '—'}» не названо явно, юрособа ${mapped.legalEntityCode}`,
        );
      }

      personMonths.push({
        sheet: sheet.name,
        year,
        month,
        lastName: parsed.lastName,
        firstName: parsed.firstName,
        middleName: parsed.middleName,
        employeeKey,
        altKeys,
        payGroup: mapped.payGroup,
        legalEntityCode: mapped.legalEntityCode,
        employerRaw,
        cardDigits: parsed.cardDigits,
        notes: parsed.notes.length ? parsed.notes.join('; ') : null,
        rate,
        entries,
        unnamedEmployer: mapped.unnamed,
      });
    }
  }

  const uf = new UnionFind();
  for (const row of personMonths) {
    uf.add(row.employeeKey);
    for (const alt of row.altKeys) uf.union(row.employeeKey, alt);
  }

  const merged = new Map<string, HrXlsxPersonMonth[]>();
  for (const row of personMonths) {
    const cluster = uf.find(row.employeeKey);
    const list = merged.get(cluster) ?? [];
    list.push(row);
    merged.set(cluster, list);
  }

  const byEmployeeKey = new Map<string, HrXlsxPersonMonth[]>();
  for (const rows of merged.values()) {
    const best = pickCanonicalName(rows);
    const canonical = hrEmployeeImportKey(best.lastName, best.firstName, best.middleName);
    const existing = byEmployeeKey.get(canonical) ?? [];
    existing.push(...rows.map((row) => ({ ...row, employeeKey: canonical, lastName: best.lastName, firstName: best.firstName, middleName: best.middleName })));
    byEmployeeKey.set(canonical, existing);
  }

  const employees: HrXlsxImportEmployeePreviewDto[] = [];
  const employments: HrXlsxImportEmploymentPreviewDto[] = [];

  for (const [key, rows] of byEmployeeKey) {
    rows.sort((a, b) => a.year - b.year || a.month - b.month);
    const best = pickCanonicalName(rows);
    const months = [...new Set(rows.map((item) => formatYearMonth(item.year, item.month)))];
    const payGroups = [...new Set(rows.map((item) => item.payGroup))];
    const legalEntityCodes = [...new Set(rows.map((item) => item.legalEntityCode))];
    const cardDigits = rows.map((item) => item.cardDigits).find(Boolean) ?? null;
    const notes = [...new Set(rows.map((item) => item.notes).filter(Boolean))] as string[];
    const entryCount = rows.reduce((sum, item) => sum + item.entries.length, 0);
    employees.push({
      employeeKey: key,
      displayName: [best.lastName, best.firstName, best.middleName].filter(Boolean).join(' '),
      lastName: best.lastName,
      firstName: best.firstName,
      middleName: best.middleName,
      cardMasked: cardDigits ? `•••• ${cardDigits.slice(-4)}` : null,
      notes: notes.join('; ') || null,
      months,
      payGroups,
      legalEntityCodes,
      entryCount,
      hasRate: rows.some((item) => item.rate != null),
    });

    const comboFirst = new Map<string, HrXlsxPersonMonth>();
    for (const row of rows) {
      const combo = `${row.legalEntityCode}::${row.payGroup}`;
      if (!comboFirst.has(combo)) comboFirst.set(combo, row);
    }
    for (const first of comboFirst.values()) {
      const validFrom = `${formatYearMonth(first.year, first.month)}-01`;
      const related = rows.filter(
        (item) => item.legalEntityCode === first.legalEntityCode && item.payGroup === first.payGroup,
      );
      const rate = [...related].reverse().find((item) => item.rate)?.rate ?? null;
      employments.push({
        employmentImportKey: hrEmploymentImportKey(key, first.legalEntityCode, first.payGroup, validFrom),
        employeeKey: key,
        displayName: [best.lastName, best.firstName, best.middleName].filter(Boolean).join(' '),
        legalEntityCode: first.legalEntityCode,
        payGroup: first.payGroup,
        validFrom,
        rateKind: rate?.kind ?? null,
        rateAmount: rate?.amount ?? null,
        entryCount: related.reduce((sum, item) => sum + item.entries.length, 0),
      });
    }
  }

  employees.sort((a, b) => a.displayName.localeCompare(b.displayName, 'uk'));
  employments.sort((a, b) => a.displayName.localeCompare(b.displayName, 'uk'));

  const uniqueSkip = collapseSkips(skipped);
  const uniqueWarnings = [...new Set(warnings)].slice(0, 80);

  const counts: HrXlsxImportCountsDto = {
    sheets: sheets.length,
    employees: employees.length,
    employments: employments.length,
    entries: personMonths.reduce((sum, item) => sum + item.entries.length, 0),
    payTerms: employments.filter((item) => item.rateAmount).length,
    skippedRows: uniqueSkip.filter((item) => item.reason !== 'unknown_cell' && item.reason !== 'dismissal_note').length,
    skippedCells,
  };

  return {
    preview: {
      year: yearHint,
      counts,
      employees,
      employments,
      skipped: uniqueSkip.slice(0, 80),
      warnings: uniqueWarnings,
    },
    personMonths,
    byEmployeeKey,
  };
}

function pickCanonicalName(rows: HrXlsxPersonMonth[]): HrXlsxPersonMonth {
  return [...rows].sort((a, b) => {
    const am = a.middleName ? 1 : 0;
    const bm = b.middleName ? 1 : 0;
    if (am !== bm) return bm - am;
    const al = a.lastName === a.firstName ? 0 : 1;
    const bl = b.lastName === b.firstName ? 0 : 1;
    if (al !== bl) return bl - al;
    return `${b.lastName} ${b.firstName}`.length - `${a.lastName} ${a.firstName}`.length;
  })[0] ?? rows[0];
}

function collapseSkips(items: HrXlsxImportSkipDto[]): HrXlsxImportSkipDto[] {
  const map = new Map<string, HrXlsxImportSkipDto>();
  for (const item of items) {
    const key = `${item.reason}:${item.detail}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}
