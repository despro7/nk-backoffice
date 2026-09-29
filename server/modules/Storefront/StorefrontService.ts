/**
 * Storefront settings & presets (Phase 1 — BO only).
 */

import { prisma, logServer } from '../../lib/utils.js';
import {
  STOREFRONT_DEFAULT_BLOCKS,
  STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS,
  STOREFRONT_DEFAULT_META_KEYS,
  STOREFRONT_DEFAULT_PRESET_NAME,
  STOREFRONT_DEFAULT_STOCK_VIA_WC,
  STOREFRONT_SETTINGS_KEYS,
  normalizeStorefrontBlocks,
  normalizeStorefrontKitComponentSettings,
  normalizeStorefrontMetaKeys,
} from '../../../shared/constants/storefrontDefaults.js';
import type {
  StorefrontBlockConfig,
  StorefrontKitComponentSettings,
  StorefrontMetaKeyConfig,
  StorefrontPresetDto,
  StorefrontPresetInput,
  StorefrontSettingsDto,
  StorefrontStockViaWcMode,
  StorefrontSyncSettingsDto,
  StorefrontWooSettingsInput,
  WooConnectionTestResult,
} from '../../../shared/types/storefront.js';
import type { WooCommerceCredentials } from './WooCommerceApiClient.js';
import { createWooCommerceClient } from './WooCommerceApiClient.js';

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

async function readKitComponentSettings(): Promise<StorefrontKitComponentSettings> {
  const raw = await readSetting(STOREFRONT_SETTINGS_KEYS.kitComponentSettings);
  if (!raw) return normalizeStorefrontKitComponentSettings(STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS);
  try {
    return normalizeStorefrontKitComponentSettings(JSON.parse(raw) as unknown);
  } catch (err) {
    logServer('[StorefrontService] kitComponentSettings parse failed', err);
    return normalizeStorefrontKitComponentSettings(STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS);
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

function maskConsumerSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 4) return 'cs_***';
  return `cs_***${secret.slice(-4)}`;
}

async function readWooEnabled(): Promise<boolean> {
  const raw = await readSetting(STOREFRONT_SETTINGS_KEYS.woo.enabled);
  return raw === 'true' || raw === '1';
}

function parseStockViaWcMode(raw: string | null | undefined): StorefrontStockViaWcMode {
  if (raw === 'parallel' || raw === 'wc_only') return raw;
  return STOREFRONT_DEFAULT_STOCK_VIA_WC;
}

async function readSyncSettings(): Promise<StorefrontSyncSettingsDto> {
  const autoPushRaw = await readSetting(STOREFRONT_SETTINGS_KEYS.sync.autoPushOnSave);
  const stockViaWcRaw = await readSetting(STOREFRONT_SETTINGS_KEYS.sync.stockViaWc);
  return {
    autoPushOnSave: autoPushRaw === 'true' || autoPushRaw === '1',
    stockViaWc: parseStockViaWcMode(stockViaWcRaw),
  };
}

export async function readWooCredentialsRaw(): Promise<WooCommerceCredentials | null> {
  const siteUrl = await readSetting(STOREFRONT_SETTINGS_KEYS.woo.siteUrl);
  const consumerKey = await readSetting(STOREFRONT_SETTINGS_KEYS.woo.consumerKey);
  const consumerSecret = await readSetting(STOREFRONT_SETTINGS_KEYS.woo.consumerSecret);
  if (!siteUrl?.trim() || !consumerKey?.trim() || !consumerSecret?.trim()) return null;
  return {
    siteUrl: siteUrl.trim(),
    consumerKey: consumerKey.trim(),
    consumerSecret: consumerSecret.trim(),
  };
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
        'Meta-ключі WooCommerce для сайту',
      );
    }

    const kitSettingsRaw = await readSetting(STOREFRONT_SETTINGS_KEYS.kitComponentSettings);
    if (!kitSettingsRaw) {
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.kitComponentSettings,
        JSON.stringify(STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS),
        'Категорії компонентів комплекту для шаблону kitComponents',
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
        'Default preset id для конструктора опису сайту',
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

  /** Credentials для read-only операцій (inspect, pull-preview, test-connection). */
  async getWooCredentialsConfigured(): Promise<WooCommerceCredentials> {
    const creds = await readWooCredentialsRaw();
    if (!creds) {
      throw new Error(
        'WooCommerce credentials не налаштовані. Заповніть їх у Налаштування → Сайт.',
      );
    }
    return creds;
  }

  /** Credentials для sync-операцій (pull-apply, push, media). Потребує увімкненої інтеграції. */
  async getWooCredentialsInternal(): Promise<WooCommerceCredentials> {
    const creds = await this.getWooCredentialsConfigured();
    const enabled = await readWooEnabled();
    if (!enabled) {
      throw new Error(
        'WooCommerce інтеграція вимкнена. Увімкніть перемикач у Налаштування → Сайт та збережіть credentials.',
      );
    }
    return creds;
  }

  async testWooConnection(
    override?: Partial<WooCommerceCredentials>,
  ): Promise<WooConnectionTestResult> {
    const saved = await readWooCredentialsRaw();
    const creds: WooCommerceCredentials = {
      siteUrl: override?.siteUrl?.trim() || saved?.siteUrl || '',
      consumerKey: override?.consumerKey?.trim() || saved?.consumerKey || '',
      consumerSecret: override?.consumerSecret?.trim() || saved?.consumerSecret || '',
    };
    if (!creds.siteUrl || !creds.consumerKey || !creds.consumerSecret) {
      return { ok: false, error: 'Заповніть URL, Consumer Key та Consumer Secret' };
    }
    return createWooCommerceClient(creds).testConnection();
  }

  async getSettings(): Promise<StorefrontSettingsDto> {
    await this.ensureSeed();
    const metaKeys = await readMetaKeys();
    const kitComponentSettings = await readKitComponentSettings();
    const defaultPresetId = await readSetting(STOREFRONT_SETTINGS_KEYS.defaultPresetId);
    const siteUrl = (await readSetting(STOREFRONT_SETTINGS_KEYS.woo.siteUrl))?.trim() || '';
    const mediaPublicBaseUrl =
      (await readSetting(STOREFRONT_SETTINGS_KEYS.woo.mediaPublicBaseUrl))?.trim() || '';
    const consumerKey = (await readSetting(STOREFRONT_SETTINGS_KEYS.woo.consumerKey))?.trim() || '';
    const consumerSecretRaw =
      (await readSetting(STOREFRONT_SETTINGS_KEYS.woo.consumerSecret))?.trim() || '';
    const enabled = await readWooEnabled();
    const sync = await readSyncSettings();

    return {
      defaultPresetId: defaultPresetId?.trim() || null,
      metaKeys,
      kitComponentSettings,
      sync,
      wooCommerce: {
        enabled,
        siteUrl,
        mediaPublicBaseUrl,
        consumerKey,
        consumerSecret: maskConsumerSecret(consumerSecretRaw),
        hasConsumerSecret: Boolean(consumerSecretRaw),
        connectionStatus:
          siteUrl && consumerKey && consumerSecretRaw
            ? enabled
              ? 'ok'
              : 'unconfigured'
            : 'unconfigured',
      },
    };
  }

  async updateWooSettings(input: StorefrontWooSettingsInput): Promise<StorefrontSettingsDto> {
    if (input.enabled !== undefined) {
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.woo.enabled,
        String(Boolean(input.enabled)),
        'WooCommerce інтеграція увімкнена',
      );
    }
    if (input.siteUrl !== undefined) {
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.woo.siteUrl,
        input.siteUrl.trim(),
        'WooCommerce site URL',
      );
    }
    if (input.mediaPublicBaseUrl !== undefined) {
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.woo.mediaPublicBaseUrl,
        input.mediaPublicBaseUrl.trim(),
        'Backoffice public URL for catalog media',
      );
    }
    if (input.consumerKey !== undefined) {
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.woo.consumerKey,
        input.consumerKey.trim(),
        'WooCommerce consumer key',
      );
    }
    if (input.consumerSecret !== undefined && input.consumerSecret.trim()) {
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.woo.consumerSecret,
        input.consumerSecret.trim(),
        'WooCommerce consumer secret',
      );
    }
    return this.getSettings();
  }

  async updateSyncSettings(input: Partial<StorefrontSyncSettingsDto>): Promise<StorefrontSettingsDto> {
    if (input.autoPushOnSave !== undefined) {
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.sync.autoPushOnSave,
        String(Boolean(input.autoPushOnSave)),
        'Автопуш на WooCommerce після збереження товару',
      );
    }
    if (input.stockViaWc !== undefined) {
      const mode = parseStockViaWcMode(input.stockViaWc);
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.sync.stockViaWc,
        mode,
        'Режим синхронізації залишків WooCommerce',
      );
    }
    return this.getSettings();
  }

  async getStockViaWcMode(): Promise<StorefrontStockViaWcMode> {
    const sync = await readSyncSettings();
    return sync.stockViaWc;
  }

  async updateSettings(input: {
    defaultPresetId?: string | null;
    metaKeys?: StorefrontMetaKeyConfig[];
    kitComponentSettings?: StorefrontKitComponentSettings;
    wooCommerce?: StorefrontWooSettingsInput;
    sync?: Partial<StorefrontSyncSettingsDto>;
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
        'Meta-ключі WooCommerce для сайту',
      );
    }

    if (input.kitComponentSettings) {
      const normalized = normalizeStorefrontKitComponentSettings(input.kitComponentSettings);
      await writeSetting(
        STOREFRONT_SETTINGS_KEYS.kitComponentSettings,
        JSON.stringify(normalized),
        'Категорії компонентів комплекту для шаблону kitComponents',
      );
    }

    if (input.wooCommerce) {
      await this.updateWooSettings(input.wooCommerce);
    }

    if (input.sync) {
      await this.updateSyncSettings(input.sync);
    }

    return this.getSettings();
  }
}

export const storefrontService = new StorefrontService();
