// Централізований сервіс управління логуванням
import { LoggingSettingsTypes } from '../types/logging';

// Глобальна змінна для відстеження часу старту програми
const appStartTime = Date.now();

// Дефолтні налаштування логування
const defaultSettings: LoggingSettingsTypes = {
  authContextLogs: true,
  apiCallLogs: false,
  routingLogs: false,
  equipmentLogs: true,
  debugLogs: false,
  performanceLogs: false,
  loggingSettingsLogs: false,
  orderAssemblyLogs: false,
  cookieLogs: false,
  warehouseMovementLogs: false,
  productSetsLogs: false
};

export class LoggingService {
  private static settings: LoggingSettingsTypes = defaultSettings;
  private static isInitialized = false;

  // Инициализация сервиса с настройками из БД
  static async initialize() {
    try {
      const response = await fetch('/api/settings/logging', {
        credentials: 'include'
      });
      if (response.ok) {
        const settings = await response.json();
        this.settings = { ...defaultSettings, ...settings };
        // console.log('📋 [LoggingService] Налаштування логування завантажено з БД через API', this.settings);
      } else {
        console.log('📋 [LoggingService] Використовуємо налаштування логування за замовчуванням');
      }
    } catch (error) {
      console.warn('📋 [LoggingService] Помилка завантаження налаштувань логування, використовуємо дефолтні:', error);
    } finally {
      this.isInitialized = true;
    }
  }

  // Оновлення налаштувань локально
  static updateSettings(settings: LoggingSettingsTypes) {
  this.settings = settings;
  console.log('📋 [LoggingService] Налаштування логування оновлено локально');
  console.log('📋 [LoggingService] authContextLogs:', this.settings.authContextLogs ? 'включені' : 'вимкнені');
  }

  // Збереження налаштувань на сервер
  static async saveSettings(settings: LoggingSettingsTypes): Promise<boolean> {
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
        console.log('✅ [LoggingService] Налаштування логування збережено на сервер:', this.settings);
        return true;
      } else {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        console.error('❌ [LoggingService] Помилка збереження налаштувань логування:', errorData);
        console.error('❌ [LoggingService] Статус відповіді:', response.status);
        console.error('❌ [LoggingService] Заголовки відповіді:', Object.fromEntries(response.headers));
        return false;
      }
    } catch (error) {
      console.error('❌ [LoggingService] Мережева помилка при збереженні налаштувань логування:', error);
      return false;
    }
  }

  // Перевірка чи ініціалізований сервіс
  static isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  // Отримання поточних налаштувань
  static getSettings(): LoggingSettingsTypes {
    // Переконуємося, що всі поля ініціалізовані коректно
    return {
      ...defaultSettings,
      ...this.settings
    };
  }

  // Форматування часу для логів
  private static formatTimeOnly(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString('uk-UA', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // Основна функція консольного логування
  static log(message: string, data?: any, category: keyof LoggingSettingsTypes = 'debugLogs', force: boolean = false) {
    // Якщо не force і логування вимкнено - не виводимо
    if (!force && !this.settings[category]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const timeFromStart = (Date.now() - appStartTime) / 1000;
    console.log(
      `\n════ [${this.formatTimeOnly(timestamp)}] ════ [${timeFromStart.toFixed(2)}s] ════\n${message}`,
      ...(data !== undefined ? [data, '\n\n'] : ['\n\n'])
    );
  }

  // Логування AuthContext
  static authLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'authContextLogs', force);
  }

  // Логування API запитів
  static apiLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'apiCallLogs', force);
  }

  // Логування маршрутизації
  static routeLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'routingLogs', force);
  }

  // Логування обладнання
  static equipmentLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'equipmentLogs', force);
  }
  
  // Налагоджувальне логування
  static debugLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'debugLogs', force);
  }
  
  // Логування продуктивності
  static perfLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'performanceLogs', force);
  }
  
  // Логування налаштувань логування
  static loggingSettingsLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'loggingSettingsLogs', force);
  }

  // Логування комплектації замовлень
  static orderAssemblyLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'orderAssemblyLogs', force);
  }

  // Логування роботи з cookies
  static cookieLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'cookieLogs', force);
  }

  // Логування складських переміщень
  static warehouseMovementLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'warehouseMovementLogs', force);
  }

  // Логування наборів товарів
  static productSetsLog(message: string, data?: any, force: boolean = false) {
    this.log(message, data, 'productSetsLogs', force);
  }


  // Метод для перевірки ініціалізації
  static isReady(): boolean {
    return this.isInitialized;
  }
}

// Ініціалізуємо сервіс під час завантаження модуля
if (typeof window !== 'undefined') {
  LoggingService.initialize();
}
