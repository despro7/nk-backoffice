import {
  parseStorefrontDescriptionDoc,
  walkStorefrontDescriptionBlocks,
} from './storefrontDescription.js';

function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

/** Текст з override блоку опису вітрини (вкладка «Опис»), якщо користувач редагував блок у doc. */
export function resolveStorefrontBlockOverridePlain(
  storefrontDescriptionDoc: string | null | undefined,
  resolver: 'ingredients' | 'storage',
): string | null {
  const doc = parseStorefrontDescriptionDoc(storefrontDescriptionDoc);
  if (!doc) return null;
  for (const attrs of walkStorefrontDescriptionBlocks(doc)) {
    if (attrs.resolver !== resolver) continue;
    const override = attrs.overrideContent?.trim();
    if (override) return stripHtmlToPlain(override);
  }
  return null;
}
