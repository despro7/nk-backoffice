/**
 * Dilovod metadata: listMetadata / getMetadata з кешем і хелперами регістрів.
 * Ключі settings_base: dilovod.meta.list, dilovod.meta.obj.{objectName} (+ .lastUpdate).
 */

import { prisma, logServer } from '../../lib/utils.js';
import { DilovodApiClient } from './DilovodApiClient.js';
import type {
  DilovodMetadataList,
  DilovodMetadataListItem,
  DilovodMetadataReq,
  DilovodObjectMetadata,
  DilovodRegisterField,
  DilovodRegisterFieldKind,
  DilovodRegisterShape,
  DilovodVirtualBatFields,
} from './DilovodTypes.js';

const CATEGORY = 'dilovod';
const TTL_MS = 24 * 60 * 60 * 1000;
const LIST_KEY = 'list';
const GOODS_REGISTER_CANDIDATES = [
  'balanceRegisters.goods',
  'accumulationRegisters.goods',
] as const;

interface MemoryEntry<T> {
  expiresAt: number;
  data: T;
}

function stringifyValueType(valueType: DilovodMetadataReq['valueType']): string | undefined {
  if (typeof valueType === 'string' && valueType.trim()) return valueType.trim();
  if (Array.isArray(valueType)) {
    const names = valueType
      .map((item) => stringifyValueType(item as DilovodMetadataReq['valueType']))
      .filter((name): name is string => Boolean(name));
    return names.length > 0 ? names.join('|') : undefined;
  }
  if (valueType && typeof valueType === 'object') {
    const rec = valueType as { name?: unknown; type?: unknown; id?: unknown };
    if (typeof rec.name === 'string' && rec.name.trim()) return rec.name.trim();
    if (typeof rec.type === 'string' && rec.type.trim()) return rec.type.trim();
    if (typeof rec.id === 'string' && rec.id.trim()) return rec.id.trim();
  }
  return undefined;
}

function reqsToRecord(
  reqs: DilovodObjectMetadata['reqs'] | DilovodMetadataReq[] | Record<string, DilovodMetadataReq> | undefined
): Record<string, DilovodMetadataReq> {
  if (!reqs) return {};
  if (Array.isArray(reqs)) {
    const out: Record<string, DilovodMetadataReq> = {};
    for (const item of reqs) {
      const name = typeof item?.name === 'string' ? item.name : '';
      if (name) out[name] = item;
    }
    return out;
  }
  if (typeof reqs === 'object') {
    const out: Record<string, DilovodMetadataReq> = {};
    for (const [name, item] of Object.entries(reqs)) {
      if (item && typeof item === 'object') out[name] = item;
    }
    return out;
  }
  return {};
}

function classifyKind(name: string, req: DilovodMetadataReq | null | undefined): DilovodRegisterFieldKind {
  if (!req) return 'attribute';
  const hints = [req.kind, req.use, req.role, req.purpose, req.type]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.toLowerCase());

  for (const hint of hints) {
    if (hint.includes('dimension') || hint.includes('вимір')) return 'dimension';
    if (hint.includes('resource') || hint.includes('ресурс')) return 'resource';
    if (hint.includes('attribute') || hint.includes('реквізит') || hint.includes('requisite')) {
      return 'attribute';
    }
  }

  const valueType = (stringifyValueType(req.valueType) || '').toLowerCase();
  const lowerName = name.toLowerCase();
  const resourceNameHints = ['qty', 'amount', 'cost', 'sum', 'price', 'weight'];
  const numericTypes = ['number', 'qty', 'amount', 'decimal', 'float', 'numeric', 'money'];

  if (resourceNameHints.some((h) => lowerName === h || lowerName.startsWith(h))) return 'resource';
  if (numericTypes.some((t) => valueType === t || valueType.includes(t))) return 'resource';
  if (valueType.startsWith('catalogs.') || valueType.startsWith('documents.')) return 'dimension';

  return 'attribute';
}

function toField(name: string, req: DilovodMetadataReq | null | undefined, kind: DilovodRegisterFieldKind): DilovodRegisterField {
  const safeReq: DilovodMetadataReq = req && typeof req === 'object' ? req : {};
  const presentation = typeof safeReq.presentation === 'string' && safeReq.presentation.trim()
    ? safeReq.presentation.trim()
    : name;
  return {
    name,
    presentation,
    valueType: stringifyValueType(safeReq.valueType),
    kind,
    raw: { ...safeReq, name: safeReq.name || name },
  };
}

function shortRegisterName(objectName: string): string {
  const idx = objectName.lastIndexOf('.');
  return idx >= 0 ? objectName.slice(idx + 1) : objectName;
}

function matchesQuery(objectName: string, item: DilovodMetadataListItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    objectName.toLowerCase().includes(needle)
    || (item.presentation || '').toLowerCase().includes(needle)
    || (item.id || '').toLowerCase().includes(needle)
    || (item.idPrefix || '').toLowerCase().includes(needle)
  );
}

export class DilovodMetadataService {
  private readonly api: DilovodApiClient;
  private readonly memory = new Map<string, MemoryEntry<unknown>>();

  constructor(apiClient?: DilovodApiClient) {
    this.api = apiClient ?? new DilovodApiClient();
  }

  virtualBatFields(resourceName: string): DilovodVirtualBatFields {
    const base = resourceName.trim();
    if (!base) {
      throw new Error('virtualBatFields: порожнє імʼя ресурсу');
    }
    return {
      start: `${base}Start`,
      receipt: `${base}Receipt`,
      expense: `${base}Expense`,
      final: `${base}Final`,
    };
  }

  async getList(options?: { q?: string; forceRefresh?: boolean }): Promise<DilovodMetadataList> {
    const list = await this.loadList(options?.forceRefresh === true);
    const q = options?.q?.trim();
    if (!q) return list;

    const filtered: DilovodMetadataList = {};
    for (const [objectName, item] of Object.entries(list)) {
      if (matchesQuery(objectName, item, q)) {
        filtered[objectName] = item;
      }
    }
    return filtered;
  }

  async getObject(objectName: string, forceRefresh = false): Promise<DilovodObjectMetadata> {
    const resolved = await this.resolveObjectName(objectName, forceRefresh);
    return this.loadObject(resolved, forceRefresh);
  }

  async getRegisterShape(objectName: string, forceRefresh = false): Promise<DilovodRegisterShape> {
    const meta = await this.getObject(objectName, forceRefresh);
    return this.buildRegisterShape(meta);
  }

  async resolveGoodsRegisterObjectName(forceRefresh = false): Promise<string> {
    return this.resolveObjectName('goods', forceRefresh);
  }

  private buildRegisterShape(meta: DilovodObjectMetadata): DilovodRegisterShape {
    const dimensionEntries = reqsToRecord(meta.dimensions);
    const resourceEntries = reqsToRecord(meta.resources);
    const reqs = reqsToRecord(meta.reqs);

    const dimensions: DilovodRegisterField[] = [];
    const resources: DilovodRegisterField[] = [];
    const attributes: DilovodRegisterField[] = [];
    const seen = new Set<string>();

    for (const [name, req] of Object.entries(dimensionEntries)) {
      dimensions.push(toField(name, req, 'dimension'));
      seen.add(name);
    }
    for (const [name, req] of Object.entries(resourceEntries)) {
      resources.push(toField(name, req, 'resource'));
      seen.add(name);
    }
    const hasExplicitShape =
      Object.keys(dimensionEntries).length > 0 || Object.keys(resourceEntries).length > 0;

    for (const [name, req] of Object.entries(reqs)) {
      if (seen.has(name)) continue;
      if (hasExplicitShape) {
        attributes.push(toField(name, req, 'attribute'));
        continue;
      }
      const kind = classifyKind(name, req);
      const field = toField(name, req, kind);
      if (kind === 'dimension') dimensions.push(field);
      else if (kind === 'resource') resources.push(field);
      else attributes.push(field);
    }

    return {
      objectName: meta.name,
      registerName: shortRegisterName(meta.name),
      presentation: meta.presentation || meta.listPresentation,
      dimensions,
      resources,
      attributes,
    };
  }

  private async resolveObjectName(objectName: string, forceRefresh: boolean): Promise<string> {
    const requested = objectName.trim();
    if (!requested) {
      throw new Error('Dilovod metadata: порожнє objectName');
    }

    if (requested.includes('.')) {
      return requested;
    }

    const list = await this.loadList(forceRefresh);
    const keyMatches = Object.keys(list).filter(
      (key) => key === requested || key.endsWith(`.${requested}`)
    );
    const preferredKey =
      keyMatches.find((key) => key.startsWith('balanceRegisters.'))
      || keyMatches.find((key) => key.startsWith('accumulationRegisters.'))
      || keyMatches.find((key) => key !== `catalogs.${requested}`)
      || keyMatches[0];
    if (preferredKey) return preferredKey;

    const candidates = requested === 'goods'
      ? [...GOODS_REGISTER_CANDIDATES]
      : [
          `balanceRegisters.${requested}`,
          `accumulationRegisters.${requested}`,
          `catalogs.${requested}`,
        ];

    for (const candidate of candidates) {
      if (list[candidate]) return candidate;
      try {
        await this.loadObject(candidate, forceRefresh);
        return candidate;
      } catch (error) {
        logServer(`Dilovod metadata: кандидат ${candidate} недоступний`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const lower = requested.toLowerCase();
    const byPresentation = Object.entries(list).find(([, item]) =>
      (item.presentation || '').toLowerCase().includes(lower)
    );
    if (byPresentation) return byPresentation[0];

    throw new Error(`Dilovod metadata: не знайдено обʼєкт «${requested}»`);
  }

  private async loadList(forceRefresh: boolean): Promise<DilovodMetadataList> {
    if (!forceRefresh) {
      const cached = await this.readCache<DilovodMetadataList>(LIST_KEY);
      if (cached) return cached;
    }

    logServer('Dilovod metadata: listMetadata з API');
    const list = await this.api.listMetadata('uk');
    await this.writeCache(LIST_KEY, list);
    return list;
  }

  private async loadObject(objectName: string, forceRefresh: boolean): Promise<DilovodObjectMetadata> {
    const cacheKey = this.objectCacheKey(objectName);
    if (!forceRefresh) {
      const cached = await this.readCache<DilovodObjectMetadata>(cacheKey);
      if (cached) return cached;
    }

    logServer(`Dilovod metadata: getMetadata(${objectName}) з API`);
    const meta = await this.api.getMetadataByName(objectName, 'uk');
    await this.writeCache(cacheKey, meta);
    return meta;
  }

  private objectCacheKey(objectName: string): string {
    return `obj.${objectName}`;
  }

  private settingsKey(cacheKey: string): string {
    return `dilovod.meta.${cacheKey}`;
  }

  private settingsStampKey(cacheKey: string): string {
    return `${this.settingsKey(cacheKey)}.lastUpdate`;
  }

  private async readCache<T>(cacheKey: string): Promise<T | null> {
    const mem = this.memory.get(cacheKey);
    if (mem && mem.expiresAt > Date.now()) {
      return mem.data as T;
    }

    try {
      const stamp = await prisma.settingsBase.findUnique({
        where: { key: this.settingsStampKey(cacheKey) },
      });
      if (!stamp) return null;

      const ageMs = Date.now() - new Date(stamp.value).getTime();
      if (!Number.isFinite(ageMs) || ageMs >= TTL_MS) return null;

      const record = await prisma.settingsBase.findUnique({
        where: { key: this.settingsKey(cacheKey) },
      });
      if (!record) return null;

      const data = JSON.parse(record.value) as T;
      this.memory.set(cacheKey, { data, expiresAt: Date.now() + (TTL_MS - ageMs) });
      return data;
    } catch (error) {
      logServer(`Dilovod metadata: помилка читання кешу ${cacheKey}`, error);
      return null;
    }
  }

  private async writeCache<T>(cacheKey: string, data: T): Promise<void> {
    this.memory.set(cacheKey, { data, expiresAt: Date.now() + TTL_MS });

    try {
      const now = new Date();
      const dataKey = this.settingsKey(cacheKey);
      const stampKey = this.settingsStampKey(cacheKey);

      await prisma.settingsBase.upsert({
        where: { key: dataKey },
        create: {
          key: dataKey,
          value: JSON.stringify(data),
          description: `Кеш метаданих Dilovod: ${cacheKey}`,
          category: CATEGORY,
          isActive: true,
        },
        update: {
          value: JSON.stringify(data),
          updatedAt: now,
        },
      });

      await prisma.settingsBase.upsert({
        where: { key: stampKey },
        create: {
          key: stampKey,
          value: now.toISOString(),
          description: `Дата оновлення кешу метаданих Dilovod: ${cacheKey}`,
          category: CATEGORY,
          isActive: true,
        },
        update: {
          value: now.toISOString(),
          updatedAt: now,
        },
      });
    } catch (error) {
      logServer(`Dilovod metadata: не вдалося записати settings_base для ${cacheKey}`, error);
    }
  }
}

export const dilovodMetadataService = new DilovodMetadataService();
