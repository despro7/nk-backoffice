export function normalizeChatwootMessageContent(content: string | null | undefined): string {
  return (content ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function previewChatwootContent(content: string | null | undefined, max = 120): string {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
