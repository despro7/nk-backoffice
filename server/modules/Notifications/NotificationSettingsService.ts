/**
 * Notification Centre settings: CRUD for rules and glossary with revision history,
 * plus read-only data for the settings playground (sources, raw logs).
 */

import { prisma } from '../../lib/utils.js';
import { DEFAULT_NOTIFICATION_RULES } from '../../../shared/notifications/defaultRules.js';
import { findMatchingRule, validatePattern, validateRule } from '../../../shared/notifications/ruleEngine.js';
import {
  isNotificationGroup,
  isNotificationKind,
  isNotificationLevel,
} from '../../../shared/constants/notifications.js';
import type {
  NotificationGlossaryEntry,
  NotificationRuleDef,
  NotificationRuleMatch,
  NotificationRuleOutput,
} from '../../../shared/types/notificationRules.js';
import type {
  NotificationConfigRevisionDto,
  NotificationRawLog,
  NotificationSourceSummary,
} from '../../../shared/types/notificationSettings.js';
import { notificationConfigService } from './NotificationConfigService.js';
import { notificationFeedService, parseInitiator } from './NotificationFeedService.js';

export class NotificationSettingsError extends Error {
  constructor(message: string, public status = 400, public details?: string[]) {
    super(message);
  }
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  return v ? v.slice(0, max) : undefined;
}

/** Нормалізує тіло запиту в NotificationRuleDef (без id / position). */
export function sanitizeRuleInput(body: any): Omit<NotificationRuleDef, 'id' | 'position' | 'key'> {
  const m = body?.match ?? {};
  const o = body?.output ?? {};
  const match: NotificationRuleMatch = {};
  const categories = Array.isArray(m.categories)
    ? m.categories.map((c: unknown) => str(c, 32)).filter(Boolean) as string[]
    : [];
  if (categories.length) match.categories = [...new Set(categories)];
  const statuses = Array.isArray(m.statuses) ? m.statuses.filter(isNotificationLevel) : [];
  if (statuses.length) match.statuses = [...new Set(statuses)] as NotificationRuleMatch['statuses'];
  for (const field of ['title', 'message', 'initiatedBy'] as const) {
    const v = str(m[field], 500);
    if (v) match[field] = v;
  }
  const dataHas = str(m.dataHas, 120);
  if (dataHas) match.dataHas = dataHas;

  const output: NotificationRuleOutput = { visibility: o.visibility === 'hidden' ? 'hidden' : 'show' };
  if (isNotificationKind(o.kind)) output.kind = o.kind;
  if (isNotificationGroup(o.group)) output.group = o.group;
  if (isNotificationLevel(o.level)) output.level = o.level;
  for (const field of ['title', 'message', 'actionLabel', 'actionLink'] as const) {
    const v = str(o[field], 2000);
    if (v) output[field] = v;
  }
  if (Array.isArray(o.replacements)) {
    output.replacements = o.replacements
      .slice(0, 30)
      .map((r: any) => ({
        pattern: typeof r?.pattern === 'string' ? r.pattern.slice(0, 500) : '',
        flags: typeof r?.flags === 'string' ? r.flags.replace(/[^imsu]/g, '').slice(0, 4) : undefined,
        replace: typeof r?.replace === 'string' ? r.replace.slice(0, 1000) : '',
        target: r?.target === 'title' || r?.target === 'both' ? r.target : 'message',
      }))
      .filter((r: { pattern: string }) => r.pattern);
    if (!output.replacements?.length) delete output.replacements;
  }

  return {
    name: str(body?.name, 160) ?? '',
    enabled: body?.enabled !== false,
    match,
    output,
  };
}

function ruleSnapshot(row: { id: number; key: string | null; name: string; enabled: boolean; position: number; match: unknown; output: unknown }) {
  return { id: row.id, key: row.key, name: row.name, enabled: row.enabled, position: row.position, match: row.match, output: row.output };
}

export class NotificationSettingsService {
  private async revision(entity: 'rule' | 'glossary', entityId: number | null, action: string, before: unknown, after: unknown, userId: number) {
    await prisma.notificationConfigRevision.create({
      data: {
        entity,
        entityId,
        action,
        before: (before ?? undefined) as object | undefined,
        after: (after ?? undefined) as object | undefined,
        userId: userId || null,
      },
    });
  }

  private changed() {
    notificationConfigService.invalidate();
  }

  // ── Rules ──────────────────────────────────────────────────────────────────

  async listRules(): Promise<NotificationRuleDef[]> {
    return (await notificationConfigService.get()).rules;
  }

  private assertValid(rule: NotificationRuleDef) {
    const errors = validateRule(rule);
    if (errors.length) throw new NotificationSettingsError('Правило містить помилки', 400, errors);
  }

  async createRule(body: unknown, userId: number, position?: number): Promise<NotificationRuleDef> {
    const input = sanitizeRuleInput(body);
    const last = await prisma.notificationRule.aggregate({ _max: { position: true } });
    const pos = typeof position === 'number' ? position : (last._max.position ?? 0) + 10;
    this.assertValid({ ...input, position: pos });
    const row = await prisma.notificationRule.create({
      data: { name: input.name, enabled: input.enabled, position: pos, match: input.match as object, output: input.output as object, updatedById: userId || null },
    });
    await this.revision('rule', row.id, 'create', null, ruleSnapshot(row), userId);
    this.changed();
    return (await this.listRules()).find((r) => r.id === row.id)!;
  }

  async updateRule(id: number, body: unknown, userId: number): Promise<NotificationRuleDef> {
    const before = await prisma.notificationRule.findUnique({ where: { id } });
    if (!before) throw new NotificationSettingsError('Правило не знайдено', 404);
    const input = sanitizeRuleInput(body);
    this.assertValid({ ...input, position: before.position });
    const row = await prisma.notificationRule.update({
      where: { id },
      data: { name: input.name, enabled: input.enabled, match: input.match as object, output: input.output as object, updatedById: userId || -1 },
    });
    await this.revision('rule', id, 'update', ruleSnapshot(before), ruleSnapshot(row), userId);
    this.changed();
    return (await this.listRules()).find((r) => r.id === id)!;
  }

  async setRuleEnabled(id: number, enabled: boolean, userId: number): Promise<void> {
    const before = await prisma.notificationRule.findUnique({ where: { id } });
    if (!before) throw new NotificationSettingsError('Правило не знайдено', 404);
    const row = await prisma.notificationRule.update({ where: { id }, data: { enabled, updatedById: userId || -1 } });
    await this.revision('rule', id, 'update', ruleSnapshot(before), ruleSnapshot(row), userId);
    this.changed();
  }

  async deleteRule(id: number, userId: number): Promise<void> {
    const before = await prisma.notificationRule.findUnique({ where: { id } });
    if (!before) throw new NotificationSettingsError('Правило не знайдено', 404);
    await prisma.notificationRule.delete({ where: { id } });
    await this.revision('rule', id, 'delete', ruleSnapshot(before), null, userId);
    this.changed();
  }

  async reorderRules(ids: number[], userId: number): Promise<void> {
    const rows = await prisma.notificationRule.findMany({ select: { id: true, position: true } });
    const known = new Set(rows.map((r) => r.id));
    const ordered = ids.filter((id) => known.has(id));
    const rest = rows.filter((r) => !ordered.includes(r.id)).sort((a, b) => a.position - b.position).map((r) => r.id);
    const finalOrder = [...ordered, ...rest];
    const before = rows.sort((a, b) => a.position - b.position).map((r) => r.id);
    await prisma.$transaction(
      finalOrder.map((id, index) => prisma.notificationRule.update({ where: { id }, data: { position: (index + 1) * 10 } })),
    );
    await this.revision('rule', null, 'reorder', { order: before }, { order: finalOrder }, userId);
    this.changed();
  }

  /** Повертає стандартне правило до версії з коду (і знову вмикає автооновлення). */
  async resetRule(id: number, userId: number): Promise<NotificationRuleDef> {
    const before = await prisma.notificationRule.findUnique({ where: { id } });
    if (!before) throw new NotificationSettingsError('Правило не знайдено', 404);
    const def = DEFAULT_NOTIFICATION_RULES.find((r) => r.key && r.key === before.key);
    if (!def) throw new NotificationSettingsError('Це правило не стандартне, скидати нема до чого');
    const row = await prisma.notificationRule.update({
      where: { id },
      data: { name: def.name, enabled: def.enabled, match: def.match as object, output: def.output as object, updatedById: null },
    });
    await this.revision('rule', id, 'reset', ruleSnapshot(before), ruleSnapshot(row), userId);
    this.changed();
    return (await this.listRules()).find((r) => r.id === id)!;
  }

  // ── Glossary ───────────────────────────────────────────────────────────────

  private sanitizeGlossary(body: any) {
    const phrase = typeof body?.phrase === 'string' ? body.phrase.slice(0, 300) : '';
    const replacement = typeof body?.replacement === 'string' ? body.replacement.slice(0, 500) : '';
    const isRegex = body?.isRegex === true;
    if (!phrase.trim()) throw new NotificationSettingsError('Вкажіть фразу');
    if (isRegex) {
      const res = validatePattern(phrase, 'i');
      if (!res.ok) throw new NotificationSettingsError(res.error ?? 'Невірний regex');
    }
    return { phrase, replacement, isRegex, enabled: body?.enabled !== false };
  }

  async listGlossary(): Promise<NotificationGlossaryEntry[]> {
    return (await notificationConfigService.get()).glossary;
  }

  async createGlossary(body: unknown, userId: number) {
    const data = this.sanitizeGlossary(body);
    const last = await prisma.notificationGlossaryEntry.aggregate({ _max: { position: true } });
    const row = await prisma.notificationGlossaryEntry.create({
      data: { ...data, position: (last._max.position ?? 0) + 10, updatedById: userId || null },
    });
    await this.revision('glossary', row.id, 'create', null, row, userId);
    this.changed();
    return row;
  }

  async updateGlossary(id: number, body: unknown, userId: number) {
    const before = await prisma.notificationGlossaryEntry.findUnique({ where: { id } });
    if (!before) throw new NotificationSettingsError('Запис не знайдено', 404);
    const row = await prisma.notificationGlossaryEntry.update({
      where: { id },
      data: { ...this.sanitizeGlossary(body), updatedById: userId || null },
    });
    await this.revision('glossary', id, 'update', before, row, userId);
    this.changed();
    return row;
  }

  async deleteGlossary(id: number, userId: number) {
    const before = await prisma.notificationGlossaryEntry.findUnique({ where: { id } });
    if (!before) throw new NotificationSettingsError('Запис не знайдено', 404);
    await prisma.notificationGlossaryEntry.delete({ where: { id } });
    await this.revision('glossary', id, 'delete', before, null, userId);
    this.changed();
  }

  // ── History ────────────────────────────────────────────────────────────────

  async listRevisions(limit = 100): Promise<NotificationConfigRevisionDto[]> {
    const rows = await prisma.notificationConfigRevision.findMany({ orderBy: { id: 'desc' }, take: Math.min(limit, 300) });
    const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is number => v != null))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, u.name || u.email]));
    return rows.map((r) => ({
      id: r.id,
      entity: r.entity as 'rule' | 'glossary',
      entityId: r.entityId,
      action: r.action,
      before: r.before,
      after: r.after,
      userId: r.userId,
      userName: r.userId != null ? names.get(r.userId) ?? null : null,
      createdAt: r.createdAt.toISOString(),
      label: revisionLabel(r.before, r.after),
    }));
  }

  /** Відкат: повертає стан `before` цієї ревізії (видалене – відновлює, створене – видаляє). */
  async revert(revisionId: number, userId: number): Promise<void> {
    const rev = await prisma.notificationConfigRevision.findUnique({ where: { id: revisionId } });
    if (!rev) throw new NotificationSettingsError('Запис історії не знайдено', 404);
    const before = rev.before as any;

    if (rev.entity === 'rule') {
      if (rev.action === 'reorder') {
        const order = Array.isArray(before?.order) ? before.order.map(Number) : [];
        await this.reorderRules(order, userId);
        return;
      }
      if (rev.action === 'create') {
        if (rev.entityId != null && (await prisma.notificationRule.findUnique({ where: { id: rev.entityId } }))) {
          await this.deleteRule(rev.entityId, userId);
        }
        return;
      }
      if (!before) throw new NotificationSettingsError('Немає стану для відкату');
      const existing = await prisma.notificationRule.findUnique({ where: { id: before.id } });
      const def = before.key ? DEFAULT_NOTIFICATION_RULES.find((r) => r.key === before.key) : undefined;
      // Повернули рівно до стандартної версії – правило знову оновлюється разом із кодом.
      const isDefault = !!def && JSON.stringify([def.name, def.enabled, def.match, def.output]) ===
        JSON.stringify([before.name, before.enabled, before.match, before.output]);
      const data = { name: before.name, enabled: before.enabled, match: before.match, output: before.output, updatedById: isDefault ? null : userId || -1 };
      if (existing) {
        const row = await prisma.notificationRule.update({ where: { id: existing.id }, data });
        await this.revision('rule', existing.id, 'revert', ruleSnapshot(existing), ruleSnapshot(row), userId);
      } else {
        const keyTaken = before.key ? await prisma.notificationRule.findUnique({ where: { key: before.key } }) : null;
        const row = await prisma.notificationRule.create({
          data: { ...data, key: keyTaken ? null : before.key ?? null, position: before.position ?? 0 },
        });
        await this.revision('rule', row.id, 'revert', null, ruleSnapshot(row), userId);
      }
      this.changed();
      return;
    }

    // glossary
    if (rev.action === 'create') {
      if (rev.entityId != null && (await prisma.notificationGlossaryEntry.findUnique({ where: { id: rev.entityId } }))) {
        await this.deleteGlossary(rev.entityId, userId);
      }
      return;
    }
    if (!before) throw new NotificationSettingsError('Немає стану для відкату');
    const data = { phrase: before.phrase, replacement: before.replacement, isRegex: Boolean(before.isRegex), enabled: before.enabled !== false };
    const existing = await prisma.notificationGlossaryEntry.findUnique({ where: { id: before.id } });
    if (existing) {
      const row = await prisma.notificationGlossaryEntry.update({ where: { id: existing.id }, data });
      await this.revision('glossary', existing.id, 'revert', existing, row, userId);
    } else {
      const row = await prisma.notificationGlossaryEntry.create({ data: { ...data, position: before.position ?? 0 } });
      await this.revision('glossary', row.id, 'revert', null, row, userId);
    }
    this.changed();
  }

  // ── Playground data ────────────────────────────────────────────────────────

  /** Унікальні джерела meta_logs (категорія + статус + заголовок) і правило, що їх покриває. */
  async listSources(days = 90): Promise<NotificationSourceSummary[]> {
    const rows = await prisma.$queryRawUnsafe<Array<{ category: string; status: string; title: string | null; n: bigint; lastAt: Date; sampleId: number }>>(
      `SELECT category, status, title, COUNT(*) AS n, MAX(datetime) AS lastAt, MAX(id) AS sampleId
       FROM meta_logs WHERE datetime >= NOW() - INTERVAL ? DAY
       GROUP BY category, status, title ORDER BY n DESC LIMIT 300`,
      Math.max(1, Math.min(days, 365)),
    );
    const samples = await prisma.meta_logs.findMany({
      where: { id: { in: rows.map((r) => Number(r.sampleId)) } },
      select: { id: true, category: true, status: true, title: true, message: true, orderNumber: true, initiatedBy: true, data: true },
    });
    const sampleById = new Map(samples.map((s) => [s.id, s]));
    const { rules } = await notificationConfigService.get();
    return rows.map((r) => {
      const sample = sampleById.get(Number(r.sampleId));
      const hit = sample ? findMatchingRule(sample, rules) : null;
      return {
        category: r.category,
        status: r.status,
        title: r.title,
        count: Number(r.n),
        lastAt: new Date(r.lastAt).toISOString(),
        sampleId: Number(r.sampleId),
        ruleId: hit?.rule.id ?? null,
        ruleName: hit?.rule.name ?? null,
        visible: hit ? hit.rule.output.visibility === 'show' : r.status === 'error' || r.status === 'warning',
      };
    });
  }

  /** Сирі записи для тестера (data обрізано до 20 КБ). */
  async listRawLogs(params: { search?: string; category?: string; status?: string; limit?: number; ids?: number[] }): Promise<NotificationRawLog[]> {
    const where: any = {};
    if (params.ids?.length) where.id = { in: params.ids.slice(0, 200) };
    if (params.category) where.category = params.category;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search } },
        { message: { contains: params.search } },
        { orderNumber: { contains: params.search } },
      ];
    }
    const rows = await prisma.meta_logs.findMany({
      where,
      orderBy: { id: 'desc' },
      take: Math.min(params.limit ?? 300, 1000),
      select: { id: true, datetime: true, category: true, status: true, title: true, message: true, orderNumber: true, initiatedBy: true, data: true },
    });
    const initiators = rows.map((r) => parseInitiator(r.initiatedBy));
    const userIds = [...new Set(initiators.map((i) => i.userId).filter((v): v is number => v != null))];
    const emails = [...new Set(initiators.map((i) => i.email).filter((v): v is string => Boolean(v)))];
    const users = userIds.length || emails.length
      ? await prisma.user.findMany({ where: { OR: [{ id: { in: userIds } }, { email: { in: emails } }] }, select: { id: true, email: true, name: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const byEmail = new Map(users.map((u) => [u.email, u]));
    return rows.map((r, index) => {
      const init = initiators[index];
      const user = init.userId != null ? byId.get(init.userId) : init.email ? byEmail.get(init.email) : undefined;
      let data: unknown = r.data;
      try {
        if (data && JSON.stringify(data).length > 20_000) data = trimData(data);
      } catch {
        data = null;
      }
      return {
        id: r.id,
        createdAt: r.datetime.toISOString(),
        category: r.category,
        status: r.status,
        title: r.title,
        message: r.message,
        orderNumber: r.orderNumber,
        initiatedBy: r.initiatedBy,
        data,
        actorUserId: user?.id ?? null,
        actorName: user ? user.name || user.email : null,
      };
    });
  }

  /** Перегляд стрічки як вказаний користувач / роль (для playground). */
  feedService = notificationFeedService;
}

/** Лишає верхній рівень data, великі вкладені обʼєкти замінює позначкою. */
function trimData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const size = JSON.stringify(v ?? null).length;
    out[k] = size > 2000 ? `[${size} байт, обрізано]` : v;
  }
  return out;
}

function revisionLabel(before: unknown, after: unknown): string {
  const pick = (v: any) => (v && typeof v === 'object' ? v.name ?? v.phrase ?? null : null);
  return pick(after) ?? pick(before) ?? 'Порядок правил';
}

export const notificationSettingsService = new NotificationSettingsService();
