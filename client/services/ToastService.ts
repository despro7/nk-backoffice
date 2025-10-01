import { addToast } from "@heroui/react";
import { ToastSettingsTypes } from '../types/toast';

export interface ToastOptions {
	title: string;
	description?: string;
	hideIcon?: boolean;
	variant?: "flat" | "solid" | "bordered";
	color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
	timeout?: number;
	shouldShowTimeoutProgress?: boolean;
	// Optional key from ToastSettingsTypes to gate showing this toast
	settingKey?: keyof ToastSettingsTypes;
}


export class ToastService {
	private static defaultOptions: Partial<ToastOptions> = {
		variant: "flat",
		color: "default",
		hideIcon: true,
		timeout: 10000,
		shouldShowTimeoutProgress: true
	};

	private static settings: ToastSettingsTypes | null = null;

	// Фолбек налаштування, якщо не вдалося завантажити з сервера
	private static readonly DEFAULT_TOAST_SETTINGS: ToastSettingsTypes = {
		authSuccess: true,
		authErrors: true,
		tokenRefresh: true,
		tokenExpiry: true,
		apiErrors: true,
		equipmentStatus: true,
		systemNotifications: true,
	};

		// Глобальна ініціалізація toast-налаштувань
		static async initialize(): Promise<boolean> {
		try {
			const response = await fetch('/api/settings/toast', {
				credentials: 'include'
			});
			if (response.ok) {
				this.settings = await response.json() as ToastSettingsTypes;
					return true;
			} else if (response.status === 401) {
				// Користувач не авторизований — використовуємо фолбек налаштування
				console.log('🔧 [ToastService] User not authenticated, applying default toast settings');
				this.settings = this.DEFAULT_TOAST_SETTINGS;
				return false;
			} else {
				console.error(`🔧 [ToastService] Failed to load settings: ${response.status}, applying default settings`);
				this.settings = this.DEFAULT_TOAST_SETTINGS;
				return false;
			}
		} catch (error) {
			console.error('🔧 [ToastService] Error loading toast settings:', error);
			this.settings = this.DEFAULT_TOAST_SETTINGS;
			return false;
		}
	}

	// Перевірка, чи потрібно показувати сповіщення
	private static shouldShowToast(type: string): boolean {
		if (!this.settings) return true;
		const val = (this.settings as any)[type];
		if (typeof val === 'boolean') return val;
		// Якщо ключ не знайдено — за замовчуванням показуємо
		return true;
	}

	static show(options: ToastOptions) {
		const mergedOptions = { ...this.defaultOptions, ...options } as Required<Partial<ToastOptions>> & ToastOptions;

		// If caller provided a settingKey and the corresponding setting is disabled, don't show the toast
		if (mergedOptions.settingKey && !this.shouldShowToast(mergedOptions.settingKey as string)) {
			return;
		}

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
		if (!this.shouldShowToast('tokenRefresh')) return;
		this.show({
			title: "🔑 Нові токени згенеровані",
			description: `Токени успішно створені для користувача ${userEmail}`,
			color: "success"
		});
	}

	static tokenRefreshed(userEmail: string) {
		if (!this.shouldShowToast('tokenRefresh')) return;
		this.show({
			title: "🔄 Токени оновлені",
			description: `Сесія автоматично оновлена для ${userEmail}`,
			color: "success"
		});
	}

	static tokenRemoved(userEmail: string) {
		if (!this.shouldShowToast('authSuccess')) return;
		this.show({
			title: "🗑️ Токени видалені",
			description: `Сесія завершена для користувача ${userEmail}`,
			color: "default"
		});
	}

	static tokenExpired() {
		if (!this.shouldShowToast('tokenExpiry')) return;
		this.show({
			title: "⏰ Сесія закінчилася",
			description: "Ваша сесія закінчилася. Виконується автоматичне оновлення...",
			color: "default"
		});
	}

	static loginSuccess(userEmail: string) {
		if (!this.shouldShowToast('authSuccess')) return;
		this.show({
			title: "✅ Авторизація успішна",
			description: `Ласкаво просимо, ${userEmail}`,
			color: "success"
		});
	}

	static logoutSuccess() {
		if (!this.shouldShowToast('authSuccess')) return;
		this.show({
			title: "👋 Вихід виконано",
			description: "Ви успішно вийшли із системи",
			color: "default"
		});
	}

	static authError(message: string) {
		if (!this.shouldShowToast('authErrors')) return;
		this.show({
			title: "❌ Помилка авторизації",
			description: message,
			color: "danger"
		});
	}

	static refreshError() {
		if (!this.shouldShowToast('tokenRefresh')) return;
		this.show({
			title: "❌ Помилка оновлення сесії",
			description: "Не вдалося оновити токени. Будь ласка, увійдіть знову.",
			color: "danger"
		});
	}

		// Метод для оновлення налаштувань (тільки локально)
		static updateSettings(newSettings: ToastSettingsTypes) {
			this.settings = newSettings;
			console.log('🔧 [ToastService] Toast-налаштування оновлені:', this.settings);
		}

		// Повертає поточні toast-налаштування (з локального кешу)
		static getSettings(): ToastSettingsTypes | null {
			return this.settings;
		}

		// Оновлює toast-налаштування на сервері
		static async saveSettings(settings: ToastSettingsTypes): Promise<void> {
			console.log('Toast settings to save:', settings);
			const response = await fetch('/api/settings/toast', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(settings)
			});
			if (response.ok) {
				this.settings = settings;
				console.log('✅ [ToastService] Toast-налаштування збережено на сервер:', settings);
			} else {
				throw new Error('Не вдалося зберегти toast-налаштування');
			}
		}

}