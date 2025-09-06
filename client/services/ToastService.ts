import { addToast } from "@heroui/react";
import * as Icons from 'lucide-react';
import React from 'react';

export interface ToastOptions {
  title: string;
  description?: string;
  hideIcon?: boolean;
  variant?: "flat" | "solid" | "bordered";
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  timeout?: number;
  shouldShowTimeoutProgress?: boolean;
  placement?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
}

export interface LoggingSettings {
  console: {
    logAccessToken: boolean;
    logRefreshToken: boolean;
    logTokenExpiry: boolean;
    logFrequency: number;
  };
  toast: {
    logLoginLogout: boolean;
    logTokenGenerated: boolean;
    logTokenRefreshed: boolean;
    logTokenRemoved: boolean;
    logTokenExpired: boolean;
    logAuthError: boolean;
    logRefreshError: boolean;
  };
}

export class ToastService {
  private static defaultOptions: Partial<ToastOptions> = {
	variant: "flat",
	color: "default",
	hideIcon: true,
    timeout: 10000,
    shouldShowTimeoutProgress: true
  };

  private static settings: LoggingSettings | null = null;

  // Завантаження налаштувань логування
  static async loadSettings(): Promise<void> {
    try {
      const response = await fetch('/api/settings/logging', {
        credentials: 'include'
      });
      if (response.ok) {
        this.settings = await response.json() as LoggingSettings;
      } else if (response.status === 401) {
        // Користувач не авторизований, використовуємо налаштування за замовчуванням
        console.log('🔧 [ToastService] User not authenticated, using default settings');
        this.settings = null; // Використовуємо налаштування за замовчуванням через shouldShowToast
      } else {
        console.error(`🔧 [ToastService] Failed to load settings: ${response.status}`);
        this.settings = null;
      }
    } catch (error) {
      console.error('🔧 [ToastService] Error loading logging settings:', error);
      this.settings = null;
    }
  }

  // Перевірка, чи потрібно показувати сповіщення
  private static shouldShowToast(type: keyof LoggingSettings['toast']): boolean {
    if (!this.settings) return true; // За замовчуванням показуємо
    return this.settings.toast[type];
  }

  static show(options: ToastOptions) {
    const mergedOptions = { ...this.defaultOptions, ...options };

    addToast({
      title: mergedOptions.title,
      description: mergedOptions.description,
      variant: mergedOptions.variant,
	  hideIcon: mergedOptions.hideIcon,
      color: mergedOptions.color,
      timeout: mergedOptions.timeout,
      shouldShowTimeoutProgress: mergedOptions.shouldShowTimeoutProgress,
    });
  }

  // Специфічні методи для авторизації
  static tokenGenerated(userEmail: string) {
    if (!this.shouldShowToast('logTokenGenerated')) return;
    this.show({
      title: "🔑 Нові токени згенеровані",
      description: `Токени успішно створені для користувача ${userEmail}`,
      color: "success"
    });
  }

  static tokenRefreshed(userEmail: string) {
    if (!this.shouldShowToast('logTokenRefreshed')) return;
    this.show({
      title: "🔄 Токени оновлені",
      description: `Сесія автоматично оновлена для ${userEmail}`,
      color: "success"
    });
  }

  static tokenRemoved(userEmail: string) {
    if (!this.shouldShowToast('logTokenRemoved')) return;
    this.show({
      title: "🗑️ Токени видалені",
      description: `Сесія завершена для користувача ${userEmail}`,
      color: "default"
    });
  }

  static tokenExpired() {
    if (!this.shouldShowToast('logTokenExpired')) return;
    this.show({
      title: "⏰ Сесія закінчилася",
      description: "Ваша сесія закінчилася. Виконується автоматичне оновлення...",
      color: "default"
    });
  }

  static loginSuccess(userEmail: string) {
    if (!this.shouldShowToast('logLoginLogout')) return;
    this.show({
      title: "✅ Авторизація успішна",
      description: `Ласкаво просимо, ${userEmail}`,
      color: "success"
    });
  }

  static logoutSuccess() {
    if (!this.shouldShowToast('logLoginLogout')) return;
    this.show({
      title: "👋 Вихід виконано",
      description: "Ви успішно вийшли із системи",
      color: "default"
    });
  }

  static authError(message: string) {
    if (!this.shouldShowToast('logAuthError')) return;
    this.show({
      title: "❌ Помилка авторизації",
      description: message,
      color: "danger"
    });
  }

  static refreshError() {
    if (!this.shouldShowToast('logRefreshError')) return;
    this.show({
      title: "❌ Помилка оновлення сесії",
      description: "Не вдалося оновити токени. Будь ласка, увійдіть знову.",
      color: "danger"
    });
  }

  // Метод для оновлення налаштувань
  static updateSettings(newSettings: LoggingSettings) {
    this.settings = newSettings;
    console.log('🔧 [ToastService] Налаштування логування оновлені:', this.settings);
  }

}
