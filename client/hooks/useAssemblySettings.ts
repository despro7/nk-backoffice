import { useState, useEffect, useRef } from 'react';
import { useApi } from './useApi';

export interface AssemblySettings {
  mode?: 'standard' | 'no_scales';
  productScanMode: 'single_per_item' | 'by_quantity';
  boxInitialStatus: 'default' | 'pending';
  autoSelectNext: boolean;
  allowManualSelect: boolean;
  successIndicationMs: number;
  successToastMs: number;
  errorIndicationMs: number;
  errorToastMs: number;
}

export interface AssemblySettingsWithLoaded extends AssemblySettings {
  isLoaded: boolean;
}

const DEFAULT_ASSEMBLY_SETTINGS: AssemblySettings = {
  mode: 'standard',
  productScanMode: 'single_per_item',
  boxInitialStatus: 'default',
  autoSelectNext: true,
  allowManualSelect: false,
  successIndicationMs: 1500,
  successToastMs: 3000,
  errorIndicationMs: 1000,
  errorToastMs: 3000,
};

/**
 * Хук для отримання налаштувань збирання замовлень з бази даних.
 * @param isAuthenticated — передавати !!user з AuthContext, щоб запит виконувався тільки після авторизації
 */
export function useAssemblySettings(isAuthenticated: boolean = false): AssemblySettingsWithLoaded {
  const { apiCall } = useApi();
  const [settings, setSettings] = useState<AssemblySettings>(DEFAULT_ASSEMBLY_SETTINGS);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // apiCall не є стабільною референцією, тому використовуємо ref
  // щоб уникнути нескінченного циклу в useEffect
  const apiCallRef = useRef(apiCall);
  useEffect(() => { apiCallRef.current = apiCall; });

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadSettings = async () => {
      try {
        const response = await apiCallRef.current('/api/settings');
        if (!response.ok) return;

        const allSettings = await response.json();
        const find = (key: string) => allSettings.find((s: any) => s.key === key);

        const loaded = {
          mode: (find('assembly_mode')?.value as 'standard' | 'no_scales') || DEFAULT_ASSEMBLY_SETTINGS.mode,
          productScanMode: (find('assembly_product_scan_mode')?.value as 'single_per_item' | 'by_quantity') || DEFAULT_ASSEMBLY_SETTINGS.productScanMode,
          boxInitialStatus: (find('assembly_box_initial_status')?.value || DEFAULT_ASSEMBLY_SETTINGS.boxInitialStatus) as 'default' | 'pending',
          autoSelectNext: (find('assembly_auto_select_next')?.value ?? 'true') === 'true',
          allowManualSelect: (find('assembly_allow_manual_select')?.value ?? 'false') === 'true',
          successIndicationMs: parseInt(find('assembly_success_indication_ms')?.value) || DEFAULT_ASSEMBLY_SETTINGS.successIndicationMs,
          successToastMs: parseInt(find('assembly_success_toast_ms')?.value) || DEFAULT_ASSEMBLY_SETTINGS.successToastMs,
          errorIndicationMs: parseInt(find('assembly_error_indication_ms')?.value) || DEFAULT_ASSEMBLY_SETTINGS.errorIndicationMs,
          errorToastMs: parseInt(find('assembly_error_toast_ms')?.value) || DEFAULT_ASSEMBLY_SETTINGS.errorToastMs,
        };
        setSettings(loaded);
        setIsLoaded(true);
      } catch (error) {
        console.error('[useAssemblySettings] Помилка завантаження налаштувань:', error);
      }
    };

    loadSettings();
  }, [isAuthenticated]);

  return { ...settings, isLoaded };
}
