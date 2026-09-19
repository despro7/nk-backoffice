/** Рівні client log для звітів (warn за замовчуванням вимкнено). */
export type SupportReportClientLogLevel = 'error' | 'info' | 'warn' | 'auth';

export type SupportReportClientLogLevels = Record<SupportReportClientLogLevel, boolean>;

/** Повні налаштування модуля звітів (зберігаються в settingsBase). */
export type SupportReportSettings = {
  telegramBotToken: string;
  telegramAlertChatId: string;
  telegramAlertsEnabled: boolean;
  clientLogLines: number;
  /** Які типи client log збирати в браузері */
  clientLogLevels: SupportReportClientLogLevels;
  /** Останні рядки console/logServer на сервері (не meta_logs) */
  serverLogLines: number;
  /** Останні записи meta_logs користувача в БД */
  serverMetaLogLines: number;
  rateLimitSeconds: number;
  maxCommentLength: number;
  maxScreenshotMb: number;
};

/** GET response — token маскується. */
export type SupportReportSettingsResponse = SupportReportSettings & {
  telegramBotTokenMasked: string;
  hasTelegramBotToken: boolean;
};

/** Публічні ліміти для клієнта (без Telegram credentials). */
export type SupportReportPublicConfig = {
  clientLogLines: number;
  clientLogLevels: SupportReportClientLogLevels;
  maxCommentLength: number;
  maxScreenshotMb: number;
  rateLimitSeconds: number;
};

export type SupportReportClientLogEntry = {
  ts: string;
  level: SupportReportClientLogLevel;
  message: string;
};

export type ScreenshotCaptureMode = 'viewport' | 'fullpage' | 'native';

export type SupportReportMetadata = {
  url: string;
  pathname: string;
  search: string;
  userAgent: string;
  viewport: { width: number; height: number };
  appVersion: string;
  orderNumber?: string;
  userId?: number;
  userEmail?: string;
  userName?: string;
  userRole?: string;
};

export type SupportReportPayload = {
  comment: string;
  screenshotBase64?: string;
  metadata: SupportReportMetadata;
  clientLogs?: SupportReportClientLogEntry[];
};

export type SupportReportResponse = {
  success: boolean;
  reportId?: number;
  message?: string;
  error?: string;
};

export const SUPPORT_REPORT_SETTINGS_KEY = 'support_report_settings';
export const SUPPORT_REPORT_SETTINGS_CATEGORY = 'support_reports';

export const DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS: SupportReportClientLogLevels = {
  error: true,
  info: true,
  warn: false,
  auth: true,
};

export const DEFAULT_SUPPORT_REPORT_SETTINGS: SupportReportSettings = {
  telegramBotToken: '',
  telegramAlertChatId: '',
  telegramAlertsEnabled: false,
  clientLogLines: 100,
  clientLogLevels: DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS,
  serverLogLines: 200,
  serverMetaLogLines: 15,
  rateLimitSeconds: 60,
  maxCommentLength: 500,
  maxScreenshotMb: 5,
};
