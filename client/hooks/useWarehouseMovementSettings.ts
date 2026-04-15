import { useState, useEffect, useCallback } from 'react';
import type { WarehouseMovementSettings } from '@shared/types/movement';

// ---------------------------------------------------------------------------
// useWarehouseMovementSettings — хук для читання/збереження налаштувань
// переміщень між складами (category='warehouse_movement' в settings_base)
// ---------------------------------------------------------------------------

interface UseWarehouseMovementSettingsResult {
  settings: WarehouseMovementSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  saveSettings: (data: Partial<WarehouseMovementSettings>) => Promise<boolean>;
  refreshSettings: () => Promise<void>;
}

export function useWarehouseMovementSettings(): UseWarehouseMovementSettingsResult {
  const [settings, setSettings] = useState<WarehouseMovementSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/settings/warehouse-movement', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setSettings(data.data);
      } else {
        throw new Error(data.error || 'Помилка завантаження налаштувань');
      }
    } catch (err) {
      console.error('[useWarehouseMovementSettings] fetchSettings:', err);
      setError(err instanceof Error ? err.message : 'Невідома помилка');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSettings = async (data: Partial<WarehouseMovementSettings>): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/warehouse-movement', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setSettings(prev => prev ? { ...prev, ...data } : null);
        return true;
      } else {
        throw new Error(result.error || 'Помилка збереження');
      }
    } catch (err) {
      console.error('[useWarehouseMovementSettings] saveSettings:', err);
      setError(err instanceof Error ? err.message : 'Невідома помилка');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const refreshSettings = async () => {
    setLoading(true);
    await fetchSettings();
  };

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return { settings, loading, saving, error, saveSettings, refreshSettings };
}
