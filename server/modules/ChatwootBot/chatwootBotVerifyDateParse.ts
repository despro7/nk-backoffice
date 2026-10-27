const UA_MONTHS: Record<string, number> = {
  січня: 1,
  лютого: 2,
  березня: 3,
  квітня: 4,
  травня: 5,
  червня: 6,
  липня: 7,
  серпня: 8,
  вересня: 9,
  жовтня: 10,
  листопада: 11,
  грудня: 12,
};

/** Calendar day in Europe/Kyiv as YYYY-MM-DD. */
export function kyivCalendarDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function parseUserOrderDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const dotted = trimmed.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (dotted) {
    const dd = dotted[1].padStart(2, '0');
    const mm = dotted[2].padStart(2, '0');
    return `${dotted[3]}-${mm}-${dd}`;
  }

  const uaText = trimmed.toLowerCase().match(/\b(\d{1,2})\s+([а-яіїєґ]+)\s+(20\d{2})\b/u);
  if (uaText) {
    const month = UA_MONTHS[uaText[2]];
    if (month) {
      const dd = uaText[1].padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      return `${uaText[3]}-${mm}-${dd}`;
    }
  }

  return null;
}

export function extractOrderNumberToken(content: string): string | null {
  const match = content.match(/\b(?:замовленн[яіє]|order|№|#)\s*[:#]?\s*([A-Za-z0-9\-_/]{4,})\b/ui);
  if (match) return match[1].trim();
  const bare = content.match(/\b(\d{5,})\b/);
  return bare ? bare[1] : null;
}
