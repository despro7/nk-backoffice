import { useState, useEffect } from 'react';
import type { DilovodSettings, DilovodDirectories } from '../../shared/types/dilovod.js';

interface UseDilovodSettingsResult {
  settings: DilovodSettings | null;
  directories: DilovodDirectories | null;
  loading: boolean;
  saving: boolean;
  loadingDirectories: boolean;
  error: string | null;
  saveSettings: (settings: Partial<DilovodSettings>) => Promise<boolean>;
  refreshSettings: () => Promise<void>;
  refreshDirectories: () => Promise<void>;
}

export function useDilovodSettings({ loadDirectories = true }: { loadDirectories?: boolean } = {}): UseDilovodSettingsResult {
  const [settings, setSettings] = useState<DilovodSettings | null>(null);
  const [directories, setDirectories] = useState<DilovodDirectories | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  const [lastApiKey, setLastApiKey] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setError(null);
      const response = await fetch('/api/dilovod/settings', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setSettings(data.data);
      } else {
        throw new Error(data.message || 'Помилка отримання налаштувань');
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError(err instanceof Error ? err.message : 'Невідома помилка');
    } finally {
      setLoading(false);
    }
  };

  const fetchDirectories = async (force: boolean = false) => {
    // Якщо вже завантажуємо і це не примусове завантаження - пропускаємо
    if (loadingDirectories && !force) {
      console.log('Directories already loading, skipping...');
      return;
    }

    // Якщо довідники вже є і API ключ не змінився - пропускаємо
    if (!force && directories && lastApiKey === settings?.apiKey) {
      console.log('Directories already loaded for current API key, skipping...');
      return;
    }

    try {
      setLoadingDirectories(true);
      setError(null);
      
      console.log('Fetching directories from API...');
      const response = await fetch('/api/dilovod/directories', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setDirectories(data.data);
        setLastApiKey(settings?.apiKey || null);
        console.log('Directories loaded successfully:', data.data);
      } else {
        throw new Error(data.message || 'Помилка отримання довідників');
      }
    } catch (err) {
      console.error('Error fetching directories:', err);
      setError(err instanceof Error ? err.message : 'Невідома помилка');
    } finally {
      setLoadingDirectories(false);
    }
  };

  const saveSettings = async (settingsToSave: Partial<DilovodSettings>): Promise<boolean> => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/dilovod/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(settingsToSave),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setSettings(data.data);
        return true;
      } else {
        throw new Error(data.message || 'Помилка збереження налаштувань');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
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

  const refreshDirectories = async () => {
    await fetchDirectories(true); // Примусове завантаження
  };

  // Завантажуємо налаштування при ініціалізації
  useEffect(() => {
    fetchSettings();
  }, []);

  // Завантажуємо довідники коли є API ключ (тільки якщо він змінився)
  useEffect(() => {
    if (!loadDirectories) {
      // Вмикаємо лениве завантаження довідників — їх потрібно запитувати явно через refreshDirectories()
      console.log('useDilovodSettings: loadDirectories disabled. Directories will not be fetched automatically.');
      return;
    }

    if (settings?.apiKey && settings.apiKey !== lastApiKey) {
      console.log('API key changed, loading directories...');
      fetchDirectories();
    }
  }, [settings?.apiKey, loadDirectories]);

  return {
    settings,
    directories,
    loading,
    saving,
    loadingDirectories,
    error,
    saveSettings,
    refreshSettings,
    refreshDirectories,
  };
}