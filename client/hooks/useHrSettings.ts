import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  hrSettingsLocalStorageKey,
  type HrPayrollSectionSettings,
  type HrSettingsSection,
} from '@shared/types/hrSettings';
import {
  DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG,
  mergePayrollTableBuilderConfig,
  type PayrollTableBuilderConfig,
} from '@shared/types/tableBuilder';

interface UseHrSettingsResult<T extends HrSettingsSection> {
  globalSettings: T extends 'payroll' ? HrPayrollSectionSettings : never;
  localOverrides: Partial<T extends 'payroll' ? HrPayrollSectionSettings : never> | null;
  effectiveSettings: T extends 'payroll' ? HrPayrollSectionSettings : never;
  loading: boolean;
  saving: boolean;
  error: string | null;
  canSaveGlobal: boolean;
  setLocalOverrides: (value: Partial<HrPayrollSectionSettings> | null) => void;
  saveGlobal: (data: Partial<HrPayrollSectionSettings>) => Promise<boolean>;
  refresh: () => Promise<void>;
}

function readLocalPayrollOverrides(): Partial<HrPayrollSectionSettings> | null {
  try {
    const raw = localStorage.getItem(hrSettingsLocalStorageKey('payroll'));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<HrPayrollSectionSettings>;
  } catch {
    return null;
  }
}

function writeLocalPayrollOverrides(value: Partial<HrPayrollSectionSettings> | null): void {
  const key = hrSettingsLocalStorageKey('payroll');
  if (!value || Object.keys(value).length === 0) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export function useHrSettings(section: 'payroll'): UseHrSettingsResult<'payroll'> {
  const { hasPermission } = useRoleAccess();
  const canSaveGlobal = hasPermission(PERMISSIONS.ACTION_HR_SETTINGS_MANAGE);
  const [globalSettings, setGlobalSettings] = useState<HrPayrollSectionSettings>({
    tableBuilder: { ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG },
  });
  const [localOverrides, setLocalOverridesState] = useState<Partial<HrPayrollSectionSettings> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/settings/hr/${section}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.error || 'Помилка завантаження');
      setGlobalSettings(json.data as HrPayrollSectionSettings);
      setLocalOverridesState(readLocalPayrollOverrides());
    } catch (err) {
      console.error('[useHrSettings] fetch:', err);
      setError(err instanceof Error ? err.message : 'Невідома помилка');
      setLocalOverridesState(readLocalPayrollOverrides());
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const setLocalOverrides = useCallback((value: Partial<HrPayrollSectionSettings> | null) => {
    writeLocalPayrollOverrides(value);
    setLocalOverridesState(value);
  }, []);

  const saveGlobal = useCallback(async (data: Partial<HrPayrollSectionSettings>): Promise<boolean> => {
    if (!canSaveGlobal) return false;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/settings/hr/${section}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.error || 'Помилка збереження');
      setGlobalSettings(json.data as HrPayrollSectionSettings);
      return true;
    } catch (err) {
      console.error('[useHrSettings] save:', err);
      setError(err instanceof Error ? err.message : 'Невідома помилка');
      return false;
    } finally {
      setSaving(false);
    }
  }, [canSaveGlobal, section]);

  const effectiveSettings = useMemo<HrPayrollSectionSettings>(() => {
    const mergedTableBuilder = mergePayrollTableBuilderConfig(
      globalSettings.tableBuilder,
      localOverrides?.tableBuilder,
    );
    return {
      tableBuilder: mergedTableBuilder,
    };
  }, [globalSettings, localOverrides]);

  return {
    globalSettings,
    localOverrides,
    effectiveSettings,
    loading,
    saving,
    error,
    canSaveGlobal,
    setLocalOverrides,
    saveGlobal,
    refresh: fetchSettings,
  };
}

export type { PayrollTableBuilderConfig };
