/**
 * Пробіли в масі нетто на наліпці: спільні значення + перевизначення шаблонів.
 * Один JSON-ключ у settings_base (`label_weight_spacing`), без окремих таблиць.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import type {
  LabelWeightSpacing,
  LabelWeightSpacingOverride,
  LabelWeightSpacingSettings,
} from '../../../shared/types/labelWeightSpacing.js';
import {
  parseLabelWeightSpacingSettings,
  resolveLabelWeightSpacing,
  sanitizeLabelWeightSpacing,
  sanitizeLabelWeightSpacingOverride,
} from '../../../shared/utils/labelWeightSpacing.js';

const SETTINGS_KEY = 'label_weight_spacing';
const SETTINGS_DESCRIPTION = 'Наліпки: пробіли в масі нетто (спільні + перевизначення шаблонів)';
const SETTINGS_CATEGORY = 'labels';

function parseValue(raw: string | null | undefined): LabelWeightSpacingSettings {
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return parseLabelWeightSpacingSettings(parsed);
}

export class LabelWeightSpacingService {
  async getSettings(): Promise<LabelWeightSpacingSettings> {
    const row = await prisma.settingsBase.findUnique({
      where: { key: SETTINGS_KEY },
      select: { value: true },
    });
    return parseValue(row?.value);
  }

  async getDefaults(): Promise<LabelWeightSpacing> {
    return (await this.getSettings()).defaults;
  }

  async getOverride(templateId: string): Promise<LabelWeightSpacingOverride | null> {
    return (await this.getSettings()).overrides[templateId] ?? null;
  }

  /** Фінальні пробіли шаблону (без шаблону – спільні значення). */
  async resolve(templateId: string | null | undefined): Promise<LabelWeightSpacing> {
    const settings = await this.getSettings();
    return resolveLabelWeightSpacing(
      settings.defaults,
      templateId ? settings.overrides[templateId] : null,
    );
  }

  async setDefaults(input: unknown): Promise<LabelWeightSpacing> {
    const defaults = sanitizeLabelWeightSpacing(input);
    await this.mutate((settings) => {
      settings.defaults = defaults;
    });
    return defaults;
  }

  /** `null` або порожнє перевизначення – шаблон успадковує спільні значення. */
  async setOverride(templateId: string, input: unknown): Promise<LabelWeightSpacingOverride | null> {
    const override = sanitizeLabelWeightSpacingOverride(input);
    await this.mutate((settings) => {
      if (override) settings.overrides[templateId] = override;
      else delete settings.overrides[templateId];
    });
    return override;
  }

  async copyOverride(fromTemplateId: string, toTemplateId: string): Promise<void> {
    await this.mutate((settings) => {
      const source = settings.overrides[fromTemplateId];
      if (source) settings.overrides[toTemplateId] = { ...source };
    });
  }

  /** Read-modify-write під блокуванням рядка, щоб два адміни не перезаписали зміни одне одного. */
  private async mutate(fn: (settings: LabelWeightSpacingSettings) => void): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.settingsBase.upsert({
        where: { key: SETTINGS_KEY },
        create: {
          key: SETTINGS_KEY,
          value: JSON.stringify(parseLabelWeightSpacingSettings(null)),
          description: SETTINGS_DESCRIPTION,
          category: SETTINGS_CATEGORY,
          isActive: true,
        },
        update: {},
      });
      const locked = await tx.$queryRaw<Array<{ value: string }>>`SELECT value FROM settings_base WHERE \`key\` = ${SETTINGS_KEY} FOR UPDATE`;
      const settings = parseValue(locked[0]?.value);
      fn(settings);
      await tx.settingsBase.update({
        where: { key: SETTINGS_KEY },
        data: { value: JSON.stringify(settings) },
      });
    });
  }
}

export const labelWeightSpacingService = new LabelWeightSpacingService();
