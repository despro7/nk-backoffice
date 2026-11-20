/**
 * Збережені пресети конструктора «Відомість по складу».
 *
 * Сховище: `settings_base` (JsonCollection, ключ `reports_warehouse_statement_presets`).
 * Видимість: `private` бачить лише автор, `public` бачать усі з доступом до звіту.
 * Змінювати / видаляти: автор або admin. Довільний період (`spec.period`) у публічних
 * пресетах не зберігається, лише відносний `periodPresetKey`.
 */

import { JsonCollection } from '../../lib/jsonCollection.js';
import {
  WAREHOUSE_STATEMENT_COLUMN_HEADER_STYLES,
  WAREHOUSE_STATEMENT_EXPENSE_KINDS,
  WAREHOUSE_STATEMENT_PRESET_NAME_MAX,
  WAREHOUSE_STATEMENT_PRESET_VISIBILITIES,
  type WarehouseStatementExclusion,
  type WarehouseStatementExpenseKind,
  type WarehouseStatementPeriod,
  type WarehouseStatementPresetCreateRequest,
  type WarehouseStatementPresetSpec,
  type WarehouseStatementPresetUpdateRequest,
  type WarehouseStatementPresetView,
  type WarehouseStatementPresetVisibility,
  type WarehouseStatementSavedPreset,
} from '../../../shared/types/warehouseStatement.js';

export const presetStore = new JsonCollection<WarehouseStatementSavedPreset>(
  'reports_warehouse_statement_presets',
  'Відомість по складу: збережені пресети конструктора',
  'reports',
);

/** Ліміт пресетів на одного автора. */
export const MAX_PRESETS_PER_OWNER = 50;
/** Ліміт розміру `spec` у JSON (байти). */
export const MAX_SPEC_BYTES = 32_000;
const MAX_ID_LIST = 1000;

export class WarehouseStatementPresetError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'WarehouseStatementPresetError';
  }
}

export interface PresetActor {
  userId: number;
  name: string;
  isAdmin: boolean;
}

export function canEditPreset(preset: WarehouseStatementSavedPreset, actor: PresetActor): boolean {
  return actor.isAdmin || preset.ownerUserId === actor.userId;
}

export function isPresetVisible(preset: WarehouseStatementSavedPreset, actor: PresetActor): boolean {
  return preset.visibility === 'public' || preset.ownerUserId === actor.userId;
}

export function toPresetView(
  preset: WarehouseStatementSavedPreset,
  actor: PresetActor,
): WarehouseStatementPresetView {
  return {
    ...preset,
    canEdit: canEditPreset(preset, actor),
    isOwn: preset.ownerUserId === actor.userId,
  };
}

export function normalizePresetName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!name) {
    throw new WarehouseStatementPresetError('Вкажіть назву пресету', 400);
  }
  if (name.length > WAREHOUSE_STATEMENT_PRESET_NAME_MAX) {
    throw new WarehouseStatementPresetError(
      `Назва пресету довша за ${WAREHOUSE_STATEMENT_PRESET_NAME_MAX} символів`,
      400,
    );
  }
  return name;
}

export function normalizeVisibility(raw: unknown): WarehouseStatementPresetVisibility {
  return (WAREHOUSE_STATEMENT_PRESET_VISIBILITIES as readonly string[]).includes(String(raw))
    ? (raw as WarehouseStatementPresetVisibility)
    : 'private';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    if (out.length >= MAX_ID_LIST) break;
  }
  return out;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function normalizePeriod(value: unknown): WarehouseStatementPeriod | undefined {
  if (!isRecord(value)) return undefined;
  if (value.mode === 'asOfDate' && typeof value.asOfDate === 'string' && YMD.test(value.asOfDate)) {
    return { mode: 'asOfDate', asOfDate: value.asOfDate };
  }
  if (
    value.mode === 'dateRange'
    && typeof value.startDate === 'string'
    && typeof value.endDate === 'string'
    && YMD.test(value.startDate)
    && YMD.test(value.endDate)
  ) {
    return { mode: 'dateRange', startDate: value.startDate, endDate: value.endDate };
  }
  return undefined;
}

function normalizeExclusions(value: unknown): WarehouseStatementExclusion[] {
  if (!Array.isArray(value)) return [];
  const out: WarehouseStatementExclusion[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const dimensionId = typeof item.dimensionId === 'string' ? item.dimensionId.trim() : '';
    const valueId = typeof item.valueId === 'string' ? item.valueId.trim() : '';
    if (!dimensionId || !valueId) continue;
    const key = `${dimensionId}:${valueId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = typeof item.label === 'string' ? item.label.slice(0, 300) : undefined;
    out.push(label ? { dimensionId, valueId, label } : { dimensionId, valueId });
    if (out.length >= MAX_ID_LIST) break;
  }
  return out;
}

/**
 * Приводить `spec` до відомих полів. Id вимірів / колонок не звіряються з meta:
 * це робить клієнт (`sanitizePreset`) під час застосування.
 */
export function normalizePresetSpec(
  raw: unknown,
  visibility: WarehouseStatementPresetVisibility,
): WarehouseStatementPresetSpec {
  if (!isRecord(raw)) {
    throw new WarehouseStatementPresetError('Некоректний вміст пресету', 400);
  }
  if (JSON.stringify(raw).length > MAX_SPEC_BYTES) {
    throw new WarehouseStatementPresetError('Пресет завеликий', 413);
  }

  const dimensionFilters: Record<string, string[]> = {};
  if (isRecord(raw.dimensionFilters)) {
    for (const [key, values] of Object.entries(raw.dimensionFilters)) {
      const list = stringList(values);
      if (key && list.length > 0) dimensionFilters[key] = list;
    }
  }

  const expenseKinds = stringList(raw.expenseKinds).filter((kind): kind is WarehouseStatementExpenseKind =>
    (WAREHOUSE_STATEMENT_EXPENSE_KINDS as readonly string[]).includes(kind),
  );
  const columnHeaderStyle = (WAREHOUSE_STATEMENT_COLUMN_HEADER_STYLES as readonly string[]).includes(
    String(raw.columnHeaderStyle),
  )
    ? (raw.columnHeaderStyle as WarehouseStatementPresetSpec['columnHeaderStyle'])
    : undefined;

  const spec: WarehouseStatementPresetSpec = {
    dimensionFilters,
    groupIds: stringList(raw.groupIds),
    exclusions: normalizeExclusions(raw.exclusions),
    expenseKinds,
    grouping: stringList(raw.grouping),
    columns: stringList(raw.columns),
  };

  if (typeof raw.priceType === 'string' && raw.priceType.trim()) spec.priceType = raw.priceType.trim();
  if (typeof raw.hideZeroQty === 'boolean') spec.hideZeroQty = raw.hideZeroQty;
  if (typeof raw.hideInactive === 'boolean') spec.hideInactive = raw.hideInactive;
  if (typeof raw.pinTotals === 'boolean') spec.pinTotals = raw.pinTotals;
  if (columnHeaderStyle) spec.columnHeaderStyle = columnHeaderStyle;

  const periodPresetKey =
    typeof raw.periodPresetKey === 'string' ? raw.periodPresetKey.trim().slice(0, 40) : '';
  if (periodPresetKey && periodPresetKey !== 'custom') {
    spec.periodPresetKey = periodPresetKey;
  } else if (visibility === 'private') {
    const period = normalizePeriod(raw.period);
    if (period) spec.period = period;
  }

  return spec;
}

/** Публічний пресет не тримає довільних дат. */
function stripCustomPeriod(spec: WarehouseStatementPresetSpec): WarehouseStatementPresetSpec {
  if (!spec.period) return spec;
  const { period: _period, ...rest } = spec;
  return rest;
}

function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, 'uk', { sensitivity: 'base' }) === 0;
}

function sortPresets(items: WarehouseStatementSavedPreset[]): WarehouseStatementSavedPreset[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'uk', { numeric: true, sensitivity: 'base' }));
}

export const warehouseStatementPresetsService = {
  async list(actor: PresetActor): Promise<WarehouseStatementPresetView[]> {
    const items = await presetStore.read();
    return sortPresets(items.filter((item) => isPresetVisible(item, actor))).map((item) =>
      toPresetView(item, actor),
    );
  },

  async create(
    actor: PresetActor,
    body: WarehouseStatementPresetCreateRequest,
  ): Promise<WarehouseStatementPresetView> {
    const name = normalizePresetName(body?.name);
    const visibility = normalizeVisibility(body?.visibility);
    const spec = normalizePresetSpec(body?.spec, visibility);
    const now = new Date().toISOString();

    const created = await presetStore.mutate((draft) => {
      const own = draft.items.filter((item) => item.ownerUserId === actor.userId);
      if (own.length >= MAX_PRESETS_PER_OWNER) {
        throw new WarehouseStatementPresetError(
          `Досягнуто ліміт ${MAX_PRESETS_PER_OWNER} пресетів`,
          409,
        );
      }
      if (own.some((item) => sameName(item.name, name))) {
        throw new WarehouseStatementPresetError('Пресет з такою назвою вже є', 409);
      }
      const record: WarehouseStatementSavedPreset = {
        id: draft.allocateId(),
        name,
        visibility,
        ownerUserId: actor.userId,
        ownerName: actor.name,
        spec,
        createdAt: now,
        updatedAt: now,
      };
      draft.items.push(record);
      return record;
    });
    return toPresetView(created, actor);
  },

  async update(
    actor: PresetActor,
    id: number,
    body: WarehouseStatementPresetUpdateRequest,
  ): Promise<WarehouseStatementPresetView> {
    const updated = await presetStore.mutate((draft) => {
      const index = draft.items.findIndex((item) => item.id === id);
      const current = index >= 0 ? draft.items[index] : undefined;
      if (!current || !isPresetVisible(current, actor)) {
        throw new WarehouseStatementPresetError('Пресет не знайдено', 404);
      }
      if (!canEditPreset(current, actor)) {
        throw new WarehouseStatementPresetError('Змінювати пресет може лише автор або адміністратор', 403);
      }

      const visibility =
        body?.visibility !== undefined ? normalizeVisibility(body.visibility) : current.visibility;
      const name = body?.name !== undefined ? normalizePresetName(body.name) : current.name;
      if (
        name !== current.name
        && draft.items.some(
          (item) => item.id !== id && item.ownerUserId === current.ownerUserId && sameName(item.name, name),
        )
      ) {
        throw new WarehouseStatementPresetError('Пресет з такою назвою вже є', 409);
      }

      let spec = body?.spec !== undefined ? normalizePresetSpec(body.spec, visibility) : current.spec;
      if (visibility === 'public') {
        spec = stripCustomPeriod(spec);
      }

      const next: WarehouseStatementSavedPreset = {
        ...current,
        name,
        visibility,
        spec,
        updatedAt: new Date().toISOString(),
      };
      draft.items[index] = next;
      return next;
    });
    return toPresetView(updated, actor);
  },

  async remove(actor: PresetActor, id: number): Promise<void> {
    await presetStore.mutate((draft) => {
      const current = draft.items.find((item) => item.id === id);
      if (!current || !isPresetVisible(current, actor)) {
        throw new WarehouseStatementPresetError('Пресет не знайдено', 404);
      }
      if (!canEditPreset(current, actor)) {
        throw new WarehouseStatementPresetError('Видаляти пресет може лише автор або адміністратор', 403);
      }
      draft.items = draft.items.filter((item) => item.id !== id);
    });
  },
};
