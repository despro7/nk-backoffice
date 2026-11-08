/**
 * Notification Centre config: rules + glossary from DB, cached in memory.
 * Seeds DEFAULT_NOTIFICATION_RULES / DEFAULT_NOTIFICATION_GLOSSARY when the tables are empty.
 * `version` grows on every change so render caches can drop stale entries.
 */

import { prisma } from '../../lib/utils.js';
import {
  DEFAULT_NOTIFICATION_GLOSSARY,
  DEFAULT_NOTIFICATION_RULES,
} from '../../../shared/notifications/defaultRules.js';
import type {
  NotificationGlossaryEntry,
  NotificationRuleDef,
  NotificationRuleMatch,
  NotificationRuleOutput,
} from '../../../shared/types/notificationRules.js';

export interface NotificationConfigSnapshot {
  version: number;
  rules: NotificationRuleDef[];
  glossary: NotificationGlossaryEntry[];
}

const CACHE_TTL_MS = 60_000;

type RuleRow = {
  id: number;
  key: string | null;
  name: string;
  enabled: boolean;
  position: number;
  match: unknown;
  output: unknown;
};

function toRuleDef(row: RuleRow): NotificationRuleDef {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    enabled: row.enabled,
    position: row.position,
    match: (row.match ?? {}) as NotificationRuleMatch,
    output: { visibility: 'show', ...((row.output ?? {}) as Partial<NotificationRuleOutput>) },
  };
}

export class NotificationConfigService {
  private snapshot: NotificationConfigSnapshot | null = null;
  private loadedAt = 0;
  private version = 1;
  private loading: Promise<NotificationConfigSnapshot> | null = null;

  /** Скинути кеш після змін (правила / словник). */
  invalidate(): void {
    this.snapshot = null;
    this.version += 1;
  }

  async get(): Promise<NotificationConfigSnapshot> {
    if (this.snapshot && Date.now() - this.loadedAt < CACHE_TTL_MS) return this.snapshot;
    if (!this.loading) {
      this.loading = this.load().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async load(): Promise<NotificationConfigSnapshot> {
    await this.seedIfEmpty();
    const [rules, glossary] = await Promise.all([
      prisma.notificationRule.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
      prisma.notificationGlossaryEntry.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    ]);
    const next: NotificationConfigSnapshot = {
      version: this.version,
      rules: rules.map(toRuleDef),
      glossary: glossary.map((g) => ({
        id: g.id,
        phrase: g.phrase,
        replacement: g.replacement,
        isRegex: g.isRegex,
        enabled: g.enabled,
        position: g.position,
      })),
    };
    // Конфіг у БД змінився (зокрема з іншого інстансу) → нова версія, рендер-кеш скидається.
    const print = fingerprint(next);
    if (print !== this.lastFingerprint) {
      if (this.lastFingerprint) this.version += 1;
      next.version = this.version;
      this.lastFingerprint = print;
    }
    this.snapshot = next;
    this.loadedAt = Date.now();
    return next;
  }

  private lastFingerprint = '';

  private defaultsSynced = false;

  /**
   * Перший запуск: засів. Далі один раз на процес: стандартні правила, яких ніхто не редагував
   * (updatedById = null), оновлюються до поточної версії з коду; нові стандартні – додаються,
   * якщо їх не видаляли вручну (є revision `delete` з цим key).
   */
  private async seedIfEmpty(): Promise<void> {
    if (this.defaultsSynced) return;
    const [existing, glossaryCount] = await Promise.all([
      prisma.notificationRule.findMany({ select: { id: true, key: true, updatedById: true } }),
      prisma.notificationGlossaryEntry.count(),
    ]);
    const byKey = new Map(existing.filter((r) => r.key).map((r) => [r.key!, r]));
    const deletedKeys = new Set<string>();
    if (existing.length > 0) {
      const deletions = await prisma.notificationConfigRevision.findMany({
        where: { entity: 'rule', action: 'delete' },
        select: { before: true },
      });
      for (const d of deletions) {
        const key = (d.before as { key?: unknown } | null)?.key;
        if (typeof key === 'string') deletedKeys.add(key);
      }
    }
    for (const def of DEFAULT_NOTIFICATION_RULES) {
      if (!def.key) continue;
      const data = {
        name: def.name,
        enabled: def.enabled,
        position: def.position,
        match: def.match as object,
        output: def.output as object,
      };
      const row = byKey.get(def.key);
      if (!row) {
        if (deletedKeys.has(def.key)) continue;
        await prisma.notificationRule.create({ data: { key: def.key, ...data } });
      } else if (row.updatedById == null) {
        await prisma.notificationRule.update({ where: { id: row.id }, data });
      }
    }
    this.defaultsSynced = true;
    if (glossaryCount === 0) {
      await prisma.notificationGlossaryEntry.createMany({
        data: DEFAULT_NOTIFICATION_GLOSSARY.map((g) => ({
          phrase: g.phrase,
          replacement: g.replacement,
          isRegex: g.isRegex,
          enabled: g.enabled,
          position: g.position,
        })),
      });
    }
  }
}

function fingerprint(s: NotificationConfigSnapshot): string {
  return JSON.stringify([s.rules, s.glossary]);
}

export const notificationConfigService = new NotificationConfigService();
