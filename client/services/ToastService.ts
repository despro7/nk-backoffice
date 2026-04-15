import { addToast } from "@heroui/react";
import { createElement } from "react";
import { ToastSettingsTypes } from '../types/toast';
import { DynamicIcon } from 'lucide-react/dynamic';

export interface ToastOptions {
	title: string;
	description?: string;
	hideIcon?: boolean;
	icon?: React.ReactNode;
	variant?: "flat" | "solid" | "bordered";
	color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
	className?: string;
	timeout?: number;
	shouldShowTimeoutProgress?: boolean;
	settingKey?: keyof ToastSettingsTypes; // Optional key from ToastSettingsTypes to gate showing this toast
	iconSpin?: boolean; // Додатково: чи анімувати іконку (наприклад, для процесу завантаження)
	iconSize?: number; // Додатково: розмір іконки в пікселях (за замовчуванням 24)
}

export class ToastService {
	private static get defaultOptions(): Partial<ToastOptions> {
		return {
			variant: "flat",
			color: "default",
			icon: "check-circle",
			timeout: 5000,
			shouldShowTimeoutProgress: true
		};
	}

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

	// Helper функція для створення іконок
	static createIcon(iconName: string, iconSize: number = 24, animation?: boolean) {
		return createElement("span", {},
			createElement(DynamicIcon, {
				name: iconName as any,
				size: iconSize,
				color: "currentColor",
				className: `${animation ? 'animate-spin' : ''} shrink-0`
			})
		);
	}

	// Загальний метод для показу тостів з урахуванням налаштувань
	static show(options: ToastOptions) {
		const mergedOptions = { ...this.defaultOptions, ...options } as Required<Partial<ToastOptions>> & ToastOptions;

		// If caller provided a settingKey and the corresponding setting is disabled, don't show the toast
		if (mergedOptions.settingKey && !this.shouldShowToast(mergedOptions.settingKey as string)) {
			return;
		}

		// console.log('🔄 Параметри запиту: ', mergedOptions);
		let warning_color = '';
		mergedOptions.color === 'warning' && (warning_color = 'bg-yellow-100 text-yellow-700');

		addToast({
			title: mergedOptions.title,
			description: mergedOptions.description,
			variant: mergedOptions.variant,
			hideIcon: mergedOptions.hideIcon ?? false,
			icon: this.createIcon(mergedOptions.icon as string, mergedOptions.iconSize, mergedOptions.iconSpin || false),
			color: mergedOptions.color,
			classNames: {
				base: warning_color,
				title: warning_color,
				description: warning_color,
			},
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