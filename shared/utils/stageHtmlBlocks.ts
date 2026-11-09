/**
 * Опис етапу техкарти (HTML після `sanitizeStageHtml`) → прості блоки для PDF:
 * абзаци, заголовки, пункти списків з маркером і текстові фрагменти з форматуванням.
 * Без DOM: вхід уже очищений до базових тегів без атрибутів.
 */

export interface StageTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export interface StageTextBlock {
  kind: 'paragraph' | 'heading' | 'item';
  runs: StageTextRun[];
  /** Маркер пункту списку: «•» або «1.» */
  marker?: string;
  /** Глибина вкладеності списку (1 – верхній рівень) */
  level?: number;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function stageHtmlToBlocks(html: string | null | undefined): StageTextBlock[] {
  if (!html) return [];
  const blocks: StageTextBlock[] = [];
  const lists: Array<{ ordered: boolean; counter: number }> = [];
  const marks = { bold: 0, italic: 0, underline: 0, strike: 0 };
  let current: StageTextBlock | null = null;

  const flush = () => {
    if (!current) return;
    // Обрізаємо пробіли по краях блоку, порожні блоки (без маркера) відкидаємо
    const runs = current.runs.filter((r) => r.text.length > 0);
    if (runs.length > 0) {
      runs[0] = { ...runs[0], text: runs[0].text.replace(/^\s+/, '') };
      const last = runs.length - 1;
      runs[last] = { ...runs[last], text: runs[last].text.replace(/\s+$/, '') };
    }
    const cleaned = runs.filter((r) => r.text.length > 0);
    if (cleaned.length > 0 || current.kind === 'item') blocks.push({ ...current, runs: cleaned });
    current = null;
  };

  const open = (kind: StageTextBlock['kind'], extra: Partial<StageTextBlock> = {}) => {
    flush();
    current = { kind, runs: [], ...extra };
  };

  const addText = (raw: string) => {
    const text = decodeEntities(raw).replace(/\s+/g, ' ');
    if (!text) return;
    if (!current) {
      if (!text.trim()) return;
      current = { kind: 'paragraph', runs: [] };
    }
    current.runs.push({
      text,
      ...(marks.bold ? { bold: true } : {}),
      ...(marks.italic ? { italic: true } : {}),
      ...(marks.underline ? { underline: true } : {}),
      ...(marks.strike ? { strike: true } : {}),
    });
  };

  const re = /<(\/?)([a-z0-9]+)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) != null) {
    if (m[3] != null) {
      addText(m[3]);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    switch (tag) {
      case 'p': {
        // TipTap кладе <p> усередину <li>: це той самий пункт; другий абзац пункту – з нового рядка
        const inItem = current != null && (current as StageTextBlock).kind === 'item';
        if (closing) {
          if (!inItem) flush();
        } else if (inItem) {
          const item = current as unknown as StageTextBlock;
          if (item.runs.length > 0) item.runs.push({ text: '\n' });
        } else {
          open('paragraph');
        }
        break;
      }
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        if (closing) flush();
        else open('heading');
        break;
      case 'ul':
      case 'ol':
        if (closing) {
          flush();
          lists.pop();
        } else {
          flush();
          lists.push({ ordered: tag === 'ol', counter: 0 });
        }
        break;
      case 'li': {
        if (closing) {
          flush();
          break;
        }
        const list = lists[lists.length - 1];
        if (list) list.counter += 1;
        open('item', {
          marker: list?.ordered ? `${list.counter}.` : '•',
          level: Math.max(1, lists.length),
        });
        break;
      }
      case 'br':
        if (current) current.runs.push({ text: '\n' });
        break;
      case 'strong':
      case 'b':
        marks.bold += closing ? -1 : 1;
        break;
      case 'em':
      case 'i':
        marks.italic += closing ? -1 : 1;
        break;
      case 'u':
        marks.underline += closing ? -1 : 1;
        break;
      case 's':
        marks.strike += closing ? -1 : 1;
        break;
      default:
        break;
    }
    for (const key of Object.keys(marks) as Array<keyof typeof marks>) marks[key] = Math.max(0, marks[key]);
  }
  flush();
  return blocks;
}
