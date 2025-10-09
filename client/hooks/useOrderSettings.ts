import { useState, useEffect } from 'react';
import type { ToleranceSettings, OrderSoundEvent } from '../types/orderAssembly';
import { playSoundChoice } from '../lib/soundUtils';

export function useOrderSettings() {
  // --- Sound settings state ---
  const [orderSoundSettings, setOrderSoundSettings] = useState<Record<OrderSoundEvent, string>>({
    pending: 'default',
    success: 'default',
    error: 'default',
  });

  // --- Tolerance settings state ---
  const [toleranceSettings, setToleranceSettings] = useState<ToleranceSettings>({
    type: 'combined',
    percentage: 5,
    absolute: 20,
    maxTolerance: 30,
    minTolerance: 10,
    maxPortions: 12,
    minPortions: 1
  });

  // Завантажуємо налаштування звуків з API під час монтування
  useEffect(() => {
    fetch('/api/settings/equipment', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data?.data?.orderSoundSettings) {
          setOrderSoundSettings((prev) => ({ ...prev, ...data.data.orderSoundSettings }));
        }
      })
      .catch(() => {/* ignore */});
  }, []);

  // Завантажуємо налаштування tolerance з API під час монтування
  useEffect(() => {
    fetch('/api/settings/weight-tolerance/values', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data) {
          setToleranceSettings(data);
        }
      })
      .catch(() => {/* ignore */});
  }, []);

  /**
   * Універсальна функція для програвання звуку статусу з урахуванням налаштувань
   */
  const playOrderStatusSound = (status: string) => {
    // status: 'pending' | 'success' | 'done' | 'error' | ...
    if (['pending', 'success', 'error'].includes(status)) {
      playSoundChoice(orderSoundSettings[status as OrderSoundEvent], status as OrderSoundEvent);
    }
  };

  return {
    orderSoundSettings,
    toleranceSettings,
    playOrderStatusSound
  };
}

