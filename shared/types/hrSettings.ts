import type { PayrollTableBuilderConfig } from './tableBuilder.js';

/** Секції HR-налаштувань (ключ settings_base: hr.section.{section}). */
export type HrSettingsSection = 'payroll';

export interface HrPayrollSectionSettings {
  tableBuilder: PayrollTableBuilderConfig;
}

export type HrSectionSettings = {
  payroll: HrPayrollSectionSettings;
};

export const HR_SETTINGS_SECTIONS: HrSettingsSection[] = ['payroll'];

export const HR_SETTINGS_LOCAL_STORAGE_PREFIX = 'hr-';
export const HR_SETTINGS_LOCAL_STORAGE_SUFFIX = '-prefs-v1';

export function hrSettingsLocalStorageKey(section: HrSettingsSection): string {
  return `${HR_SETTINGS_LOCAL_STORAGE_PREFIX}${section}${HR_SETTINGS_LOCAL_STORAGE_SUFFIX}`;
}
