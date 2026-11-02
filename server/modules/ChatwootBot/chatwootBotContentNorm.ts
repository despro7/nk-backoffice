export function normalizeChatwootMessageContent(content: string | null | undefined): string {
  return (content ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function previewChatwootContent(content: string | null | undefined, max = 120): string {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Привітання й ввічливі звертання на початку повідомлення («Доброго вечора, …», «Вітаю! …»).
 * Для теми питання вони нічого не значать, лише засмічують назви.
 */
const LEADING_GREETING =
  /^(?:\s*(?:вітаю|привіт(?:ик)?|добр(?:ий|ого|е|ий)\s+(?:день|дня|вечір|вечора|ранок|ранку|ночі)|доброго|добрий|доброї\s+(?:ночі|доби)|здрастуйте|здравствуйте|здраствуйте|добрый\s+(?:день|вечер)|доброе\s+утро|доброго\s+времени\s+суток|hello|hi|хай|слава\s+україні|героям\s+слава|дівчата|пані|шановні?)(?=$|[\s,.!?:;)–—-])[\s,.!?:;)–—-]*)+/iu;

/** Текст без привітання на початку, з великої літери; лише привітання — порожній рядок. */
export function stripLeadingGreeting(text: string): string {
  const stripped = text.replace(LEADING_GREETING, '').trim();
  if (stripped === text.trim()) return stripped;
  return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : '';
}

/** Для показу: без привітання, а якщо крім нього нічого немає — як було. */
export function displayQuestionText(text: string): string {
  return stripLeadingGreeting(text) || text.trim();
}
