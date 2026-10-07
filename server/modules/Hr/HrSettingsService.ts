import { prisma } from '../../lib/utils.js';
import {
  DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG,
  type PayrollTableBuilderConfig,
} from '../../../shared/types/tableBuilder.js';
import {
  type HrPayrollSectionSettings,
  type HrSectionSettings,
  type HrSettingsSection,
} from '../../../shared/types/hrSettings.js';
import { HrError } from './HrService.js';

const CATEGORY = 'hr';

function settingsKey(section: HrSettingsSection): string {
  return `hr.section.${section}`;
}

function defaultPayrollSettings(): HrPayrollSectionSettings {
  return {
    tableBuilder: { ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG },
  };
}

function parsePayrollSettings(raw: string | null | undefined): HrPayrollSectionSettings {
  if (!raw) return defaultPayrollSettings();
  try {
    const parsed = JSON.parse(raw) as Partial<HrPayrollSectionSettings>;
    return {
      tableBuilder: {
        ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG,
        ...(parsed.tableBuilder ?? {}),
        visibleColumns: {
          ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG.visibleColumns,
          ...(parsed.tableBuilder?.visibleColumns ?? {}),
        },
        merges: parsed.tableBuilder?.merges ?? DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG.merges,
        taxesSeparate: parsed.tableBuilder?.taxesSeparate ?? DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG.taxesSeparate,
      },
    };
  } catch {
    return defaultPayrollSettings();
  }
}

export class HrSettingsService {
  async getSection<T extends HrSettingsSection>(section: T): Promise<HrSectionSettings[T]> {
    if (section === 'payroll') {
      const row = await prisma.settingsBase.findFirst({
        where: { category: CATEGORY, key: settingsKey(section), isActive: true },
      });
      return parsePayrollSettings(row?.value) as HrSectionSettings[T];
    }
    throw new HrError(`Невідома секція налаштувань HR: ${section}`);
  }

  async saveSection<T extends HrSettingsSection>(
    section: T,
    data: Partial<HrSectionSettings[T]>,
  ): Promise<HrSectionSettings[T]> {
    if (section !== 'payroll') {
      throw new HrError(`Невідома секція налаштувань HR: ${section}`);
    }
    const current = await this.getSection('payroll');
    const merged: HrPayrollSectionSettings = {
      tableBuilder: {
        ...current.tableBuilder,
        ...(data as Partial<HrPayrollSectionSettings>).tableBuilder,
        visibleColumns: {
          ...current.tableBuilder.visibleColumns,
          ...((data as Partial<HrPayrollSectionSettings>).tableBuilder?.visibleColumns ?? {}),
        },
      },
    };

    const key = settingsKey(section);
    const existing = await prisma.settingsBase.findFirst({
      where: { category: CATEGORY, key },
    });
    const value = JSON.stringify(merged);
    if (existing) {
      await prisma.settingsBase.update({
        where: { id: existing.id },
        data: { value, isActive: true },
      });
    } else {
      await prisma.settingsBase.create({
        data: { category: CATEGORY, key, value, isActive: true },
      });
    }
    return merged as HrSectionSettings[T];
  }

  getDefaultPayrollTableBuilder(): PayrollTableBuilderConfig {
    return { ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG };
  }
}

export const hrSettingsService = new HrSettingsService();
