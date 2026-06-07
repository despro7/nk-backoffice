import { useState, useEffect } from 'react';
import type { DilovodSettings, DilovodDirectories } from '../../shared/types/dilovod.js';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';

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
  const dirsCtx = (() => {
    try {
      return useDilovodDirectories();
    } catch {
      return null as unknown as ReturnType<typeof useDilovodDirectories> | null;
    }
  })();
  const [directories, setDirectories] = useState<DilovodDirectories | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  // Keep a local fallback `lastApiKey` for when provider is not present.
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
    const providerLastApiKey = dirsCtx?.lastApiKey ?? lastApiKey;
    if (!force && (dirsCtx?.directories || directories) && providerLastApiKey === settings?.apiKey) {
      console.log('Directories already loaded for current API key, skipping...');
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('lastApiKey: ', providerLastApiKey);
      console.log('currentApiKey: ', settings?.apiKey);
    }

    try {
      setLoadingDirectories(true);
      setError(null);

      // If a provider exists, delegate loading to it (centralized cache)
      if (dirsCtx && typeof dirsCtx.loadDirectories === 'function') {
        if (process.env.NODE_ENV === 'development') {
          console.log('Delegating directories load to DilovodDirectoriesProvider...');
        }
        // Optimistically set lastApiKey so other hook instances won't repeatedly trigger reloads.
        const prevApiKey = dirsCtx?.lastApiKey ?? lastApiKey;
        try {
          if (dirsCtx?.setLastApiKey) {
            dirsCtx.setLastApiKey(settings?.apiKey || null);
          } else {
            setLastApiKey(settings?.apiKey || null);
          }
          if (process.env.NODE_ENV === 'development') {
            console.log('Delegated load: lastApiKey set to', settings?.apiKey || null);
          }
          await dirsCtx.loadDirectories(force);
          // sync local view with provider state
          setDirectories(dirsCtx.directories || null);
          if (process.env.NODE_ENV === 'development') {
            console.log('Directories loaded via provider');
          }
          return;
        } catch (err) {
          // If provider fails, revert lastApiKey and fall through to direct fetch as a safe fallback
          try {
            if (dirsCtx?.setLastApiKey) {
              dirsCtx.setLastApiKey(prevApiKey ?? null);
            } else {
              setLastApiKey(prevApiKey ?? null);
            }
          } catch {}
          console.error('Provider loadDirectories failed, falling back to direct fetch:', err);
        }
      }

      // Fallback: direct fetch from API (used when provider is absent)
      console.log('Fetching directories from API (fallback)...');
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
        if (process.env.NODE_ENV === 'development') {
          console.log('Directories loaded successfully (fallback):', data.data);
        }
        // Update context if available
        try {
          dirsCtx?.setDirectories(data.data || null);
        } catch {
          // ignore
        }
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
      // If a centralized provider exists, it will log and handle loading; avoid duplicate logs from each hook instance
      if (!dirsCtx) {
        console.log('API key changed, loading directories...');
      }
      fetchDirectories();
    }
  }, [settings?.apiKey, loadDirectories]);

  return {
    settings,
    directories: dirsCtx?.directories || directories,
    loading,
    saving,
    loadingDirectories,
    error,
    saveSettings,
    refreshSettings,
    refreshDirectories,
  };
}