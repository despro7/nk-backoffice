// Централизованный сервис управления логированием
import { ToastService } from './ToastService';

// Типы настроек консольного логирования
export interface ConsoleLoggingSettings {
  authContextLogs: boolean; // Логи AuthContext (токены, авторизация)
  apiCallLogs: boolean; // Логи API запросов
  routingLogs: boolean; // Логи навигации и маршрутизации
  equipmentLogs: boolean; // Логи оборудования (весы, принтеры)
  debugLogs: boolean; // Отладочные логи
  performanceLogs: boolean; // Логи производительности
  // Новые категории логирования
  loggingSettingsLogs: boolean; // Логи настроек логирования
  orderAssemblyLogs: boolean; // Логи комплектации заказов
  cookieLogs: boolean; // Логи работы с cookies
  warehouseMovementLogs: boolean; // Логи складских перемещений
  productSetsLogs: boolean; // Логи наборов товаров
}

// Типы настроек Toast уведомлений  
export interface ToastLoggingSettings {
  authSuccess: boolean; // Успешная авторизация/выход
  authErrors: boolean; // Ошибки авторизации
  tokenRefresh: boolean; // Автоматическое обновление токенов
  tokenExpiry: boolean; // Истечение токенов
  apiErrors: boolean; // Ошибки API запросов
  equipmentStatus: boolean; // Статус оборудования
  systemNotifications: boolean; // Системные уведомления
}

export interface LoggingSettings {
  console: ConsoleLoggingSettings;
  toast: ToastLoggingSettings;
}

// Глобальная переменная для отслеживания времени старта приложения
const appStartTime = Date.now();

// Дефолтные настройки логирования
const defaultSettings: LoggingSettings = {
  console: {
    authContextLogs: true,
    apiCallLogs: false,
    routingLogs: false,
    equipmentLogs: true,
    debugLogs: false,
    performanceLogs: false,
    // Новые категории по умолчанию
    loggingSettingsLogs: false,
    orderAssemblyLogs: false,
    cookieLogs: false,
    warehouseMovementLogs: false,
    productSetsLogs: false
  },
  toast: {
    authSuccess: true,
    authErrors: true,
    tokenRefresh: true,
    tokenExpiry: true,
    apiErrors: true,
    equipmentStatus: true,
    systemNotifications: true
  }
};

export class LoggingService {
  private static settings: LoggingSettings = defaultSettings;
  private static isInitialized = false;

  // Инициализация сервиса с настройками из БД
  static async initialize() {
    try {
      const response = await fetch('/api/settings/logging', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const settings = await response.json();
        this.settings = { 
          console: { ...defaultSettings.console, ...settings.console },
          toast: { ...defaultSettings.toast, ...settings.toast }
        };
        console.log('📋 [LoggingService] Настройки логирования загружены из файла logging-settings.json', this.settings);
      } else {
        console.log('📋 [LoggingService] Используем настройки логирования по умолчанию');
      }
    } catch (error) {
      console.warn('📋 [LoggingService] Ошибка загрузки настроек логирования, используем дефолтные:', error);
    } finally {
      this.isInitialized = true;
    }
  }

  // Обновление настроек локально
  static updateSettings(settings: LoggingSettings) {
    this.settings = settings;
    console.log('📋 [LoggingService] Настройки логирования обновлены локально');
    console.log('📋 [LoggingService] authContextLogs:', this.settings.console.authContextLogs ? 'включены' : 'отключены');
  }

  // Сохранение настроек на сервер
  static async saveSettings(settings: LoggingSettings): Promise<boolean> {
    try {
      const response = await fetch('/api/settings/logging', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        this.settings = settings;
        console.log('✅ [LoggingService] Настройки логирования сохранены на сервер:', this.settings);
        return true;
      } else {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        console.error('❌ [LoggingService] Ошибка сохранения настроек логирования:', errorData);
        console.error('❌ [LoggingService] Статус ответа:', response.status);
        console.error('❌ [LoggingService] Заголовки ответа:', Object.fromEntries(response.headers));
        return false;
      }
    } catch (error) {
      console.error('❌ [LoggingService] Сетевая ошибка при сохранении настроек логирования:', error);
      return false;
    }
  }

  // Получение текущих настроек
  static getSettings(): LoggingSettings {
    // Убеждаемся, что все поля инициализированы корректно
    return {
      console: {
        ...defaultSettings.console,
        ...this.settings.console
      },
      toast: {
        ...defaultSettings.toast,
        ...this.settings.toast
      }
    };
  }

  // Форматирование времени
  private static formatTimeOnly(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString('uk-UA', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // Основная функция консольного логирования (замена utils.log)
  static log(message: string, data?: any, category: keyof ConsoleLoggingSettings = 'debugLogs') {
    if (!this.settings.console[category]) {
      return; // Логирование отключено для этой категории
    }

    const timestamp = new Date().toISOString();
    const timeFromStart = (Date.now() - appStartTime) / 1000;
    console.log(
      `\n════ [${this.formatTimeOnly(timestamp)}] ════ [${timeFromStart.toFixed(2)}s] ════\n${message}`,
      ...(data !== undefined ? [data, '\n\n'] : ['\n\n'])
    );
  }

  // Логирование AuthContext
  static authLog(message: string, data?: any) {
    this.log(message, data, 'authContextLogs');
  }

  // Логирование API запросов
  static apiLog(message: string, data?: any) {
    this.log(message, data, 'apiCallLogs');
  }

  // Логирование маршрутизации
  static routeLog(message: string, data?: any) {
    this.log(message, data, 'routingLogs');
  }

  // Логирование оборудования
  static equipmentLog(message: string, data?: any) {
    this.log(message, data, 'equipmentLogs');
  }

  // Логирование производительности
  static perfLog(message: string, data?: any) {
    this.log(message, data, 'performanceLogs');
  }

  // Отладочное логирование
  static debugLog(message: string, data?: any) {
    this.log(message, data, 'debugLogs');
  }

  // Новые методы логирования
  
  // Логирование настроек логирования
  static loggingSettingsLog(message: string, data?: any) {
    this.log(message, data, 'loggingSettingsLogs');
  }

  // Логирование комплектации заказов
  static orderAssemblyLog(message: string, data?: any) {
    this.log(message, data, 'orderAssemblyLogs');
  }

  // Логирование работы с cookies
  static cookieLog(message: string, data?: any) {
    this.log(message, data, 'cookieLogs');
  }

  // Логирование складских перемещений
  static warehouseMovementLog(message: string, data?: any) {
    this.log(message, data, 'warehouseMovementLogs');
  }

  // Логирование наборов товаров
  static productSetsLog(message: string, data?: any) {
    this.log(message, data, 'productSetsLogs');
  }

  // Toast уведомления с проверкой настроек
  private static showToast(message: { title: string; description?: string; color: 'success' | 'danger' | 'warning' | 'default' }, category: keyof ToastLoggingSettings) {
    if (!this.settings.toast[category]) {
      return; // Toast уведомления отключены для этой категории
    }
    
    ToastService.show(message);
  }

  // Toast для успешной авторизации
  static toastAuthSuccess(email: string) {
    this.showToast({
      title: "✅ Авторизація успішна",
      description: `Ласкаво просимо, ${email}`,
      color: "success"
    }, 'authSuccess');
  }

  // Toast для выхода из системы
  static toastLogoutSuccess() {
    this.showToast({
      title: "👋 До побачення",
      description: "Ви успішно вийшли з системи",
      color: "default"
    }, 'authSuccess');
  }

  // Toast для ошибок авторизации
  static toastAuthError(message: string) {
    this.showToast({
      title: "❌ Помилка авторизації",
      description: message,
      color: "danger"
    }, 'authErrors');
  }

  // Toast для обновления токенов
  static toastTokenRefreshed(email: string) {
    this.showToast({
      title: "🔄 Сесія оновлена",
      description: `Токени автоматично оновлено для ${email}`,
      color: "success"
    }, 'tokenRefresh');
  }

  // Toast для ошибок обновления токенов
  static toastRefreshError() {
    this.showToast({
      title: "❌ Помилка оновлення сесії",
      description: "Не вдалося оновити токени. Увійдіть знову.",
      color: "danger"
    }, 'authErrors');
  }

  // Toast для истечения токенов
  static toastTokenExpired() {
    this.showToast({
      title: "⏰ Сесія закінчилася",
      description: "Ваша сесія закінчилася. Виконується автоматичне оновлення...",
      color: "warning"
    }, 'tokenExpiry');
  }

  // Toast для ошибок API
  static toastApiError(message: string) {
    this.showToast({
      title: "❌ Помилка API",
      description: message,
      color: "danger"
    }, 'apiErrors');
  }

  // Toast для статуса оборудования
  static toastEquipmentStatus(title: string, description: string, isError = false) {
    this.showToast({
      title,
      description,
      color: isError ? "danger" : "success"
    }, 'equipmentStatus');
  }

  // Toast для системных уведомлений
  static toastSystemNotification(title: string, description: string, color: 'success' | 'danger' | 'warning' | 'default' = 'default') {
    this.showToast({
      title,
      description,
      color
    }, 'systemNotifications');
  }

  // Метод для проверки инициализации
  static isReady(): boolean {
    return this.isInitialized;
  }
}

// Инициализируем сервис при загрузке модуля
if (typeof window !== 'undefined') {
  LoggingService.initialize();
}
