/**
 * Storefront settings & presets (Phase 1 — BO only).
 */

import { prisma, logServer } from '../../lib/utils.js';
import {
  STOREFRONT_DEFAULT_BLOCKS,
  STOREFRONT_DEFAULT_META_KEYS,
  STOREFRONT_DEFAULT_PRESET_NAME,
  STOREFRONT_SETTINGS_KEYS,
  normalizeStorefrontBlocks,
  normalizeStorefrontMetaKeys,
} from '../../../shared/constants/storefrontDefaults.js';
import type {
  StorefrontBlockConfig,
  StorefrontMetaKeyConfig,
  StorefrontPresetDto,
  StorefrontPresetInput,
  StorefrontSettingsDto,
} from '../../../shared/types/storefront.js';

const DEFAULT_PRESET_ID = '00000000-0000-4000-8000-000000000001';

async function readMetaKeys(): Promise<StorefrontMetaKeyConfig[]> {
  const raw = await readSetting(STOREFRONT_SETTINGS_KEYS.metaKeys);
  if (!raw) return [...STOREFRONT_DEFAULT_META_KEYS];
  try {
    return normalizeStorefrontMetaKeys(JSON.parse(raw) as unknown[]);
  } catch (err) {
    logServer('[StorefrontService] metaKeys parse failed', err);
    return [...STOREFRONT_DEFAULT_META_KEYS];
  }
}

function parseBlocksJson(raw: string, metaKeys: StorefrontMetaKeyConfig[]): StorefrontBlockConfig[] {
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [...STOREFRONT_DEFAULT_BLOCKS];
    const normalized = normalizeStorefrontBlocks(parsed, metaKeys);
    return normalized.length > 0 ? normalized : [...STOREFRONT_DEFAULT_BLOCKS];
  } catch {
    return [...STOREFRONT_DEFAULT_BLOCKS];
  }
}

function toPresetDto(
  row: {
    id: string;
    name: string;
    isDefault: boolean;
    blocksJson: string;
    createdAt: Date;
    updatedAt: Date;
  },
  metaKeys: StorefrontMetaKeyConfig[],
): StorefrontPresetDto {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    blocks: parseBlocksJson(row.blocksJson, metaKeys),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readSetting(key: string): Promise<string | null> {
  const row = await prisma.settingsBase.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string, description?: string): Promise<void> {
  await prisma.settingsBase.upsert({
    where: { key },
    create: {
      key,
      value,
      description: description ?? null,
      category: 'storefront',
      isActive: true,
    },
    update: { value },
  });
}

export class StorefrontService {
  async ensureSeed(): Promise<void> {
    const count = await prisma.catalogStorefrontPreset.count();
    if (count === 0) {
      await prisma.catalogStorefrontPreset.create({
        data: {
          id: DEFAULT_PRESET_ID,
          name: STOREFRONT_DEFAULT_PRESET_NAME,
          isDefault: true,
          blocksJson: JSON.stringify(STOREFRONT_DEFAULT_BLOCKS),
        },
      });
    }

    const metaKeysRaw = await readSetting(STOREFRONT_SETTINGS_KEYS.metaKeys);
    if (!metaKeysRaw) {
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.metaKeys,
        JSON.stringify(STOREFRONT_DEFAULT_META_KEYS),
        'Meta-ключі WooCommerce для вітрини',
      );
    }

    const defaultId = await readSetting(STOREFRONT_SETTINGS_KEYS.defaultPresetId);
    if (!defaultId) {
      const preset = await prisma.catalogStorefrontPreset.findFirst({
        where: { isDefault: true },
        select: { id: true },
      });
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.defaultPresetId,
        preset?.id ?? DEFAULT_PRESET_ID,
        'Default preset id для конструктора опису вітрини',
      );
    }
  }

  async listPresets(): Promise<StorefrontPresetDto[]> {
    await this.ensureSeed();
    const metaKeys = await readMetaKeys();
    const rows = await prisma.catalogStorefrontPreset.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return rows.map((row) => toPresetDto(row, metaKeys));
  }

  async getPreset(id: string): Promise<StorefrontPresetDto | null> {
    const metaKeys = await readMetaKeys();
    const row = await prisma.catalogStorefrontPreset.findUnique({ where: { id } });
    return row ? toPresetDto(row, metaKeys) : null;
  }

  async getDefaultPreset(): Promise<StorefrontPresetDto> {
    await this.ensureSeed();
    const settings = await this.getSettings();
    if (settings.defaultPresetId) {
      const preset = await this.getPreset(settings.defaultPresetId);
      if (preset) return preset;
    }
    const metaKeys = await readMetaKeys();
    const row = await prisma.catalogStorefrontPreset.findFirst({
      where: { isDefault: true },
    });
    if (!row) throw new Error('Default preset не знайдено');
    return toPresetDto(row, metaKeys);
  }

  async createPreset(input: StorefrontPresetInput): Promise<StorefrontPresetDto> {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Назва preset обовʼязкова');

    const metaKeys = await readMetaKeys();
    const blocks = normalizeStorefrontBlocks(
      input.blocks?.length ? input.blocks : STOREFRONT_DEFAULT_BLOCKS,
      metaKeys,
    );

    const row = await prisma.catalogStorefrontPreset.create({
      data: {
        name,
        isDefault: false,
        blocksJson: JSON.stringify(blocks),
      },
    });

    if (input.isDefault) {
      await this.setDefaultPreset(row.id);
      return (await this.getPreset(row.id))!;
    }
    return toPresetDto(row, metaKeys);
  }

  async updatePreset(id: string, input: Partial<StorefrontPresetInput>): Promise<StorefrontPresetDto> {
    const existing = await prisma.catalogStorefrontPreset.findUnique({ where: { id } });
    if (!existing) throw new Error('Preset не знайдено');

    const name = input.name !== undefined ? String(input.name).trim() : existing.name;
    if (!name) throw new Error('Назва preset обовʼязкова');

    const metaKeys = await readMetaKeys();
    const blocksJson = input.blocks
      ? JSON.stringify(normalizeStorefrontBlocks(input.blocks, metaKeys))
      : undefined;

    const row = await prisma.catalogStorefrontPreset.update({
      where: { id },
      data: {
        name,
        ...(blocksJson ? { blocksJson } : {}),
      },
    });

    if (input.isDefault) {
      await this.setDefaultPreset(id);
    }

    return toPresetDto(row, metaKeys);
  }

  async deletePreset(id: string): Promise<void> {
    const existing = await prisma.catalogStorefrontPreset.findUnique({ where: { id } });
    if (!existing) throw new Error('Preset не знайдено');
    if (existing.isDefault) throw new Error('Не можна видалити default preset');

    const count = await prisma.catalogStorefrontPreset.count();
    if (count <= 1) throw new Error('Має залишитись хоча б один preset');

    await prisma.catalogGood.updateMany({
      where: { storefrontPresetId: id },
      data: { storefrontPresetId: null },
    });

    await prisma.catalogStorefrontPreset.delete({ where: { id } });

    const settings = await this.getSettings();
    if (settings.defaultPresetId === id) {
      const fallback = await prisma.catalogStorefrontPreset.findFirst({
        where: { isDefault: true },
      });
      if (fallback) {
        await writeSetting(STOREFRONT_SETTINGS_KEYS.defaultPresetId, fallback.id);
      }
    }
  }

  private async setDefaultPreset(id: string): Promise<void> {
    await prisma.catalogStorefrontPreset.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    await prisma.catalogStorefrontPreset.update({
      where: { id },
      data: { isDefault: true },
    });
    await writeSetting(STOREFRONT_SETTINGS_KEYS.defaultPresetId, id);
  }

  async getSettings(): Promise<StorefrontSettingsDto> {
    await this.ensureSeed();
    const metaKeys = await readMetaKeys();
    const defaultPresetId = await readSetting(STOREFRONT_SETTINGS_KEYS.defaultPresetId);

    return {
      defaultPresetId: defaultPresetId?.trim() || null,
      metaKeys,
      wooCommerce: {
        enabled: false,
        siteUrl: '',
        consumerKey: '',
        consumerSecret: '',
      },
    };
  }

  async updateSettings(input: {
    defaultPresetId?: string | null;
    metaKeys?: StorefrontMetaKeyConfig[];
  }): Promise<StorefrontSettingsDto> {
    if (input.defaultPresetId) {
      const preset = await prisma.catalogStorefrontPreset.findUnique({
        where: { id: input.defaultPresetId },
      });
      if (!preset) throw new Error('Preset не знайдено');
      await this.setDefaultPreset(input.defaultPresetId);
    }

    if (input.metaKeys) {
      const normalized = normalizeStorefrontMetaKeys(input.metaKeys);
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.metaKeys,
        JSON.stringify(normalized),
        'Meta-ключі WooCommerce для вітрини',
      );
    }

    return this.getSettings();
  }
}

export const storefrontService = new StorefrontService();
