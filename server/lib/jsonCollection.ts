/**
 * A small list of records stored as one JSON value in settings_base.
 * Used for config that is tiny and rarely edited (Notification Centre rules, glossary,
 * user prefs, Telegram links; production loss types), so it does not need its own tables.
 *
 * Writes lock the settings_base row (SELECT … FOR UPDATE) for the whole read-modify-write,
 * so two instances or two admins do not overwrite each other's changes.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from './utils.js';

export interface JsonCollectionDoc<T> {
  nextId: number;
  items: T[];
}

export function parseCollectionDoc<T extends { id: number }>(raw: string | null | undefined): JsonCollectionDoc<T> {
  let parsed: Partial<JsonCollectionDoc<T>> = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  const items = Array.isArray(parsed.items) ? parsed.items.filter((i) => i && typeof i.id === 'number') : [];
  const maxId = items.reduce((max, i) => Math.max(max, i.id), 0);
  const nextId = typeof parsed.nextId === 'number' && parsed.nextId > maxId ? parsed.nextId : maxId + 1;
  return { nextId, items };
}

export interface CollectionDraft<T> {
  items: T[];
  /** Новий id для запису (зростає, не повторюється навіть після видалення). */
  allocateId(): number;
}

export class JsonCollection<T extends { id: number }> {
  constructor(
    readonly key: string,
    private readonly description: string,
    /** settings_base.category для нового рядка */
    private readonly category: string = 'notifications',
  ) {}

  /** Чи є ключ у settings_base (для засіву при першому запуску). */
  async exists(): Promise<boolean> {
    return (await prisma.settingsBase.count({ where: { key: this.key } })) > 0;
  }

  async read(): Promise<T[]> {
    const row = await prisma.settingsBase.findUnique({ where: { key: this.key }, select: { value: true } });
    return parseCollectionDoc<T>(row?.value).items;
  }

  /**
   * Змінити записи під блокуванням. `fn` отримує копію списку, яку можна змінювати на місці
   * або замінити (`draft.items = …`). Результат `fn` повертається назовні.
   */
  async mutate<R>(fn: (draft: CollectionDraft<T>) => R | Promise<R>): Promise<R> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.settingsBase.upsert({
        where: { key: this.key },
        create: { key: this.key, value: JSON.stringify({ nextId: 1, items: [] }), category: this.category, description: this.description },
        update: {},
      });
      const locked = await tx.$queryRaw<Array<{ value: string }>>`SELECT value FROM settings_base WHERE \`key\` = ${this.key} FOR UPDATE`;
      const doc = parseCollectionDoc<T>(locked[0]?.value);
      const draft: CollectionDraft<T> = {
        items: doc.items,
        allocateId: () => doc.nextId++,
      };
      const result = await fn(draft);
      await tx.settingsBase.update({
        where: { key: this.key },
        data: { value: JSON.stringify({ nextId: doc.nextId, items: draft.items }) },
      });
      return result;
    });
  }
}
