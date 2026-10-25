import { formatReleaseInternalDocDisplayNumber } from './releaseHistoryDisplayDocNumber.js';

function toDisplayDocNumber(internal: string | null | undefined): string | null {
  return formatReleaseInternalDocDisplayNumber(internal)
    ?? (String(internal ?? '').trim() || null);
}

function displayDocNumberSuffix(displayNum: string): string {
  return displayNum.replace(/^№\s*/, '').trim();
}

/** Два номери: «№616/617»; один — «№616». */
function joinDisplayDocTrailSlash(displayNums: string[]): string | null {
  if (displayNums.length === 0) return null;
  if (displayNums.length === 1) return displayNums[0];
  const first = displayNums[0];
  const lastSuffix = displayDocNumberSuffix(displayNums[displayNums.length - 1]);
  if (displayNums.length === 2) {
    return `${first}/${lastSuffix}`;
  }
  return `${first}/${lastSuffix} (+${displayNums.length - 2})`;
}

function toDisplayDocTrail(internalTrail: string | null | undefined): string | null {
  const trail = String(internalTrail ?? '').trim();
  if (!trail) return null;
  const displayNums = trail
    .split(/\s*→\s*|\s*->\s*|\s*\/\s*/)
    .map((part) => toDisplayDocNumber(part) ?? part.trim())
    .filter(Boolean);
  return joinDisplayDocTrailSlash(displayNums);
}

/** Ланцюжок номерів для UI коригування (№616/617). */
export function formatReleaseHistoryDocTrail(docNumbers: string[]): string | null {
  const nums = docNumbers
    .map((value) => toDisplayDocNumber(value))
    .filter((value): value is string => Boolean(value));
  return joinDisplayDocTrailSlash(nums);
}

function joinLabelAndDocNumbers(label: string, docNumbers: string): string {
  return `${label} ${docNumbers}`;
}

/**
 * Заголовок рядка історії: тип операції, потім короткий номер(и).
 * Приклад: «Комплектування №450», «Коригування №450/452».
 */
export function formatReleaseHistoryPrimaryTitle(params: {
  operationLabel: string;
  primaryDocNumber?: string | null;
  docTrail?: string | null;
}): string {
  const label = String(params.operationLabel ?? '').trim() || 'Операція';
  const trail = toDisplayDocTrail(params.docTrail);
  const single = toDisplayDocNumber(params.primaryDocNumber);
  const docNumbers = trail || single;
  if (docNumbers) return joinLabelAndDocNumbers(label, docNumbers);
  return label;
}

/** Частини заголовка рядка для окремого стилю номера в UI. */
export function parseReleaseHistoryPrimaryTitleParts(fullTitle: string): {
  docPrefix: string | null;
  label: string;
} {
  const title = String(fullTitle ?? '').trim();
  if (!title) return { docPrefix: null, label: '' };

  const knownLabels = ['Комплектування', 'Розукомплектування', 'Коригування'];
  for (const known of knownLabels) {
    if (title === known) return { docPrefix: null, label: known };
    const prefix = `${known} `;
    if (title.startsWith(prefix)) {
      const docPrefix = title.slice(prefix.length).trim();
      return {
        label: known,
        docPrefix: docPrefix || null,
      };
    }
  }

  return { docPrefix: null, label: title };
}

/** Заголовок кроку коригування: «Крок 1 · Комплектування №450». */
export function formatReleaseHistoryLayerTitle(params: {
  operationLabel: string;
  docNumber?: string | null;
  stepPrefix?: string;
}): string {
  const step = String(params.stepPrefix ?? '').trim();
  const label = String(params.operationLabel ?? '').trim() || 'Операція';
  const head = step ? `${step} ${label}` : label;
  const doc = toDisplayDocNumber(params.docNumber);
  if (doc) return joinLabelAndDocNumbers(head, doc);
  return head;
}

export type ReleaseHistoryDetailsHeadingKind = 'correction' | 'kit' | 'unkit' | 'operation';

function releaseHistoryDetailsHeadingLabel(kind: ReleaseHistoryDetailsHeadingKind): string {
  switch (kind) {
    case 'correction':
      return 'Деталі коригування';
    case 'kit':
      return 'Деталі комплектування';
    case 'unkit':
      return 'Деталі розукомплектування';
    default:
      return 'Деталі операції';
  }
}

/** Заголовок блоку деталей. */
export function formatReleaseHistoryDetailsHeading(params: {
  kind: ReleaseHistoryDetailsHeadingKind;
  docTrail?: string | null;
  operationDocNumber?: string | null;
}): string {
  const label = releaseHistoryDetailsHeadingLabel(params.kind);
  const trail = toDisplayDocTrail(params.docTrail);
  const single = toDisplayDocNumber(params.operationDocNumber);
  const docNumbers = trail || single;
  if (docNumbers) return joinLabelAndDocNumbers(label, docNumbers);
  return label;
}

/** Підзаголовок аудиту: «Історія змін №498». */
export function formatReleaseAuditAccordionTitle(docNumber?: string | null): string {
  const doc = toDisplayDocNumber(docNumber);
  if (doc) return joinLabelAndDocNumbers('Історія змін', doc);
  return 'Історія змін';
}
