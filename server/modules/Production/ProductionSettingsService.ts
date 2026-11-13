/**
 * Production settings in settings_base (category `production`):
 * - `production_loss_types` – JsonCollection of loss types for the BOM loss split;
 * - `production_loss_formula` – how several loss types add up to gross (additive | sequential);
 * - `production_spec_draft_auto_edit` – open a pending spec draft right in the product BOM editor
 *   (no «Редагувати» click), JSON boolean, default false.
 *
 * Loss types are never deleted: old spec versions reference them by id, so a removed type
 * becomes inactive (kept for display, hidden from new rows).
 */

import { prisma } from '../../lib/utils.js';
import { JsonCollection } from '../../lib/jsonCollection.js';
import {
  DEFAULT_PRODUCTION_LOSS_TYPE_NAMES,
  type CatalogLossFormula,
  type ProductionLossType,
  type ProductionSettingsDto,
  type ProductionSettingsInput,
} from '../../../shared/types/production.js';
import { isCatalogLossFormula, normalizeLossFormula } from '../../../shared/utils/catalogLoss.js';

const CATEGORY = 'production';
const LOSS_FORMULA_KEY = 'production_loss_formula';
const SPEC_DRAFT_AUTO_EDIT_KEY = 'production_spec_draft_auto_edit';
const LOSS_TYPE_NAME_MAX = 60;

export const lossTypeStore = new JsonCollection<ProductionLossType>(
  'production_loss_types',
  'Виробництво: типи втрат для розбивки в специфікації',
  CATEGORY,
);

export class ProductionSettingsError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** JSON boolean у settings_base; будь-що інше (немає ключа, зламаний JSON) – false. */
export function parseJsonBoolean(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

function sortTypes(types: ProductionLossType[]): ProductionLossType[] {
  return [...types].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export class ProductionSettingsService {
  /** Типи втрат; при першому зверненні засіває стартовий довідник. */
  async listLossTypes(): Promise<ProductionLossType[]> {
    if (!(await lossTypeStore.exists())) {
      await lossTypeStore.mutate((draft) => {
        if (draft.items.length > 0) return;
        draft.items = DEFAULT_PRODUCTION_LOSS_TYPE_NAMES.map((name, idx) => ({
          id: draft.allocateId(),
          name,
          sortOrder: idx,
          isActive: true,
        }));
      });
    }
    return sortTypes(await lossTypeStore.read());
  }

  async getLossFormula(): Promise<CatalogLossFormula> {
    const row = await prisma.settingsBase.findUnique({ where: { key: LOSS_FORMULA_KEY }, select: { value: true } });
    return normalizeLossFormula(row?.value);
  }

  async getSpecDraftAutoEdit(): Promise<boolean> {
    const row = await prisma.settingsBase.findUnique({ where: { key: SPEC_DRAFT_AUTO_EDIT_KEY }, select: { value: true } });
    return parseJsonBoolean(row?.value);
  }

  async getSettings(): Promise<ProductionSettingsDto> {
    const [lossTypes, lossFormula, specDraftAutoEdit] = await Promise.all([
      this.listLossTypes(),
      this.getLossFormula(),
      this.getSpecDraftAutoEdit(),
    ]);
    return { lossTypes, lossFormula, specDraftAutoEdit };
  }

  async saveSettings(input: ProductionSettingsInput): Promise<ProductionSettingsDto> {
    if (!isCatalogLossFormula(input?.lossFormula)) {
      throw new ProductionSettingsError('Невідома формула втрат');
    }
    if (input.specDraftAutoEdit !== undefined && typeof input.specDraftAutoEdit !== 'boolean') {
      throw new ProductionSettingsError('Некоректне значення налаштування чернетки специфікації');
    }
    const rows = Array.isArray(input.lossTypes) ? input.lossTypes : [];
    const names = new Set<string>();
    for (const row of rows) {
      const name = String(row?.name ?? '').trim();
      if (!name) throw new ProductionSettingsError('Назва типу втрат не може бути порожньою');
      if (name.length > LOSS_TYPE_NAME_MAX) {
        throw new ProductionSettingsError(`Назва типу втрат довша за ${LOSS_TYPE_NAME_MAX} символів`);
      }
      const key = name.toLocaleLowerCase('uk-UA');
      if (names.has(key)) throw new ProductionSettingsError(`Тип втрат «${name}» вказано двічі`);
      names.add(key);
    }

    await this.listLossTypes();
    await lossTypeStore.mutate((draft) => {
      const byId = new Map(draft.items.map((t) => [t.id, t]));
      const next: ProductionLossType[] = [];
      rows.forEach((row, idx) => {
        const id = Number(row.id);
        const existing = Number.isInteger(id) ? byId.get(id) : undefined;
        next.push({
          id: existing ? existing.id : draft.allocateId(),
          name: String(row.name).trim(),
          sortOrder: idx,
          isActive: row.isActive !== false,
        });
        if (existing) byId.delete(existing.id);
      });
      // Не передані типи не видаляємо: деактивуємо, щоб старі версії специфікацій мали назву.
      for (const left of byId.values()) {
        next.push({ ...left, sortOrder: next.length, isActive: false });
      }
      draft.items = next;
    });

    await prisma.settingsBase.upsert({
      where: { key: LOSS_FORMULA_KEY },
      create: {
        key: LOSS_FORMULA_KEY,
        value: input.lossFormula,
        category: CATEGORY,
        description: 'Виробництво: формула складання типів втрат (additive | sequential)',
      },
      update: { value: input.lossFormula },
    });

    if (input.specDraftAutoEdit !== undefined) {
      const value = JSON.stringify(input.specDraftAutoEdit);
      await prisma.settingsBase.upsert({
        where: { key: SPEC_DRAFT_AUTO_EDIT_KEY },
        create: {
          key: SPEC_DRAFT_AUTO_EDIT_KEY,
          value,
          category: CATEGORY,
          description: 'Виробництво: чернетка специфікації одразу відкрита в редакторі BOM картки товару',
        },
        update: { value },
      });
    }

    return this.getSettings();
  }
}

export const productionSettingsService = new ProductionSettingsService();
