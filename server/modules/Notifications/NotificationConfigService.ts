/**
 * Notification Centre config: rules + glossary from settings_base, cached in memory.
 * Seeds DEFAULT_NOTIFICATION_RULES / DEFAULT_NOTIFICATION_GLOSSARY on first run.
 * `version` grows on every change so render caches can drop stale entries.
 */

import { prisma } from '../../lib/utils.js';
import { glossaryStore, nowIso, ruleStore } from './notificationStores.js';
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
    const [rules, glossary] = await Promise.all([ruleStore.read(), glossaryStore.read()]);
    const byPosition = <T extends { id: number; position: number }>(a: T, b: T) => a.position - b.position || a.id - b.id;
    const next: NotificationConfigSnapshot = {
      version: this.version,
      rules: [...rules].sort(byPosition).map(toRuleDef),
      glossary: [...glossary].sort(byPosition).map((g) => ({
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
    const firstRun = !(await ruleStore.exists());
    const deletedKeys = new Set<string>();
    if (!firstRun) {
      const deletions = await prisma.notificationConfigRevision.findMany({
        where: { entity: 'rule', action: 'delete' },
        select: { before: true },
      });
      for (const d of deletions) {
        const key = (d.before as { key?: unknown } | null)?.key;
        if (typeof key === 'string') deletedKeys.add(key);
      }
    }
    await ruleStore.mutate((draft) => {
      const byKey = new Map(draft.items.filter((r) => r.key).map((r) => [r.key!, r]));
      for (const def of DEFAULT_NOTIFICATION_RULES) {
        if (!def.key) continue;
        const data = { name: def.name, enabled: def.enabled, position: def.position, match: def.match, output: def.output };
        const row = byKey.get(def.key);
        if (!row) {
          if (deletedKeys.has(def.key)) continue;
          draft.items.push({ id: draft.allocateId(), key: def.key, ...data, updatedById: null, updatedAt: nowIso() });
        } else if (row.updatedById == null && JSON.stringify(Object.values(data)) !== JSON.stringify([row.name, row.enabled, row.position, row.match, row.output])) {
          Object.assign(row, data, { updatedAt: nowIso() });
        }
      }
    });
    if (!(await glossaryStore.exists())) {
      await glossaryStore.mutate((draft) => {
        for (const g of DEFAULT_NOTIFICATION_GLOSSARY) {
          draft.items.push({
            id: draft.allocateId(),
            phrase: g.phrase,
            replacement: g.replacement,
            isRegex: g.isRegex,
            enabled: g.enabled,
            position: g.position,
            updatedById: null,
            updatedAt: nowIso(),
          });
        }
      });
    }
    this.defaultsSynced = true;
  }
}

function fingerprint(s: NotificationConfigSnapshot): string {
  return JSON.stringify([s.rules, s.glossary]);
}

export const notificationConfigService = new NotificationConfigService();
