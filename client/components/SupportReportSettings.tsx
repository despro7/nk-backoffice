import React, { useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Button,
  Input,
  Switch,
  Divider,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import type {
  SupportReportClientLogLevel,
  SupportReportSettingsResponse,
} from '@shared/types/supportReport';
import {
  DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS,
  DEFAULT_SUPPORT_REPORT_SETTINGS,
} from '@shared/types/supportReport';

type FormState = {
  telegramBotToken: string;
  telegramAlertChatId: string;
  telegramAlertsEnabled: boolean;
  clientLogLines: number;
  clientLogLevels: typeof DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS;
  serverLogLines: number;
  serverMetaLogLines: number;
  rateLimitSeconds: number;
  maxCommentLength: number;
  maxScreenshotMb: number;
  telegramBotTokenMasked: string;
  hasTelegramBotToken: boolean;
};

const CLIENT_LOG_LEVEL_LABELS: Record<SupportReportClientLogLevel, string> = {
  error: 'error (console.error, необроблені помилки)',
  info: 'info (LoggingService: api, route, debug, …)',
  warn: 'warn (console.warn)',
  auth: 'auth (LoggingService auth-context)',
};

const toFormState = (data: SupportReportSettingsResponse): FormState => ({
  telegramBotToken: '',
  telegramAlertChatId: data.telegramAlertChatId,
  telegramAlertsEnabled: data.telegramAlertsEnabled,
  clientLogLines: data.clientLogLines,
  clientLogLevels: { ...DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS, ...data.clientLogLevels },
  serverLogLines: data.serverLogLines ?? DEFAULT_SUPPORT_REPORT_SETTINGS.serverLogLines,
  serverMetaLogLines: data.serverMetaLogLines,
  rateLimitSeconds: data.rateLimitSeconds,
  maxCommentLength: data.maxCommentLength,
  maxScreenshotMb: data.maxScreenshotMb,
  telegramBotTokenMasked: data.telegramBotTokenMasked,
  hasTelegramBotToken: data.hasTelegramBotToken,
});

export const SupportReportSettings: React.FC = () => {
  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<FormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTokenVisible, setIsTokenVisible] = useState(false);
  const [isRevealingToken, setIsRevealingToken] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/settings/support-reports', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load settings');
      const json = await response.json();
      const next = toFormState(json.data as SupportReportSettingsResponse);
      setForm(next);
      setOriginal(next);
    } catch (error) {
      console.error('SupportReportSettings load error:', error);
      ToastService.show({
        title: 'Помилка',
        description: 'Не вдалося завантажити налаштування звітів',
        color: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges =
    form &&
    original &&
    JSON.stringify({ ...form, telegramBotToken: form.telegramBotToken || '__keep__' }) !==
      JSON.stringify({ ...original, telegramBotToken: original.telegramBotToken || '__keep__' });

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleToggleTokenVisibility = async () => {
    if (!form) return;

    if (!isTokenVisible && !form.telegramBotToken && form.hasTelegramBotToken) {
      setIsRevealingToken(true);
      try {
        const response = await fetch('/api/settings/support-reports?revealToken=true', {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to reveal token');
        const json = await response.json();
        if (json.data?.telegramBotToken) {
          updateField('telegramBotToken', json.data.telegramBotToken);
        }
      } catch {
        ToastService.show({
          title: 'Помилка',
          description: 'Не вдалося показати збережений token',
          color: 'danger',
        });
        return;
      } finally {
        setIsRevealingToken(false);
      }
    }

    setIsTokenVisible((value) => !value);
  };

  const handleSave = async () => {
    if (!form) return;
    setIsSaving(true);
    try {
      const payload = {
        telegramBotToken: form.telegramBotToken || undefined,
        telegramAlertChatId: form.telegramAlertChatId,
        telegramAlertsEnabled: form.telegramAlertsEnabled,
        clientLogLines: Number(form.clientLogLines),
        clientLogLevels: form.clientLogLevels,
        serverLogLines: Number(form.serverLogLines),
        serverMetaLogLines: Number(form.serverMetaLogLines),
        rateLimitSeconds: Number(form.rateLimitSeconds),
        maxCommentLength: Number(form.maxCommentLength),
        maxScreenshotMb: Number(form.maxScreenshotMb),
      };

      const response = await fetch('/api/settings/support-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save');
      }

      const next = toFormState(json.data as SupportReportSettingsResponse);
      setForm(next);
      setOriginal(next);
      setIsTokenVisible(false);
      ToastService.show({
        title: 'Збережено',
        description: 'Налаштування звітів оновлено',
        color: 'success',
      });
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося зберегти',
        color: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch('/api/settings/support-reports/test', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Test failed');
      }
      ToastService.show({
        title: 'Тест OK',
        description: json.message || 'Повідомлення надіслано в Telegram',
        color: 'success',
      });
    } catch (error) {
      ToastService.show({
        title: 'Помилка тесту',
        description: error instanceof Error ? error.message : 'Не вдалося надіслати тест',
        color: 'danger',
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading || !form) {
    return (
      <Card className="w-full">
        <CardBody className="py-8 text-center text-default-500 text-sm">
          Завантаження налаштувань звітів…
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="p-2 w-full">
      <CardHeader className="flex flex-col items-start gap-1 pb-0">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <DynamicIcon name="message-square-warning" size={18} />
          Звіти користувачів / Telegram
        </h3>
        <p className="text-sm text-default-500 font-normal">
          Глобальна кнопка «Сповістити адміна» — скриншот, опис, логи (.log) і сповіщення в канал.
          Telegram не дозволяє фото і файл в одному повідомленні: опис + скриншот надсилаються разом,
          .log — reply у тому ж треді.
        </p>
      </CardHeader>

      <CardBody className="gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            type={isTokenVisible ? 'text' : 'password'}
            label="Telegram Bot Token"
            placeholder={form.hasTelegramBotToken ? form.telegramBotTokenMasked : '123456789:ABC…'}
            value={form.telegramBotToken}
            onValueChange={(v) => updateField('telegramBotToken', v)}
            description="Token від @BotFather. Око показує збережений token. Порожнє поле при збереженні — token не змінюється."
            endContent={
              <button
                type="button"
                className="focus:outline-none"
                aria-label={isTokenVisible ? 'Приховати token' : 'Показати token'}
                onClick={() => void handleToggleTokenVisibility()}
                disabled={isRevealingToken}
              >
                {isRevealingToken ? (
                  <DynamicIcon name="loader-circle" size={18} className="animate-spin text-default-400" />
                ) : (
                  <DynamicIcon
                    name={isTokenVisible ? 'eye-off' : 'eye'}
                    size={18}
                    className="text-default-400"
                  />
                )}
              </button>
            }
          />
          <Input
            label="Telegram Alert Chat ID"
            placeholder="-1001234567890"
            value={form.telegramAlertChatId}
            onValueChange={(v) => updateField('telegramAlertChatId', v)}
            description="ID каналу або групи (з мінусом для супергруп). Бот має бути адміном каналу."
          />
        </div>

        <Switch
          isSelected={form.telegramAlertsEnabled}
          onValueChange={(v) => updateField('telegramAlertsEnabled', v)}
        >
          <span className="text-sm">Telegram-сповіщення увімкнені</span>
        </Switch>
        <p className="text-xs text-default-500 -mt-2">
          Якщо вимкнено — звіти зберігаються в meta_logs, але в Telegram не надсилаються.
        </p>

        <Divider className="bg-default-200/60" />

        <p className="text-sm font-semibold text-default-700">Ліміти та буфери</p>

        <div className="space-y-2">
          <p className="text-xs text-default-500">Типи client log для .log файлу звіту:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.keys(CLIENT_LOG_LEVEL_LABELS) as SupportReportClientLogLevel[]).map((level) => (
              <Switch
                key={level}
                size="sm"
                isSelected={form.clientLogLevels[level]}
                onValueChange={(checked) =>
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          clientLogLevels: { ...prev.clientLogLevels, [level]: checked },
                        }
                      : prev,
                  )
                }
              >
                <span className="text-xs">{CLIENT_LOG_LEVEL_LABELS[level]}</span>
              </Switch>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Input
            type="number"
            label="Рядків client log"
            value={String(form.clientLogLines)}
            onValueChange={(v) => updateField('clientLogLines', Number(v) || DEFAULT_SUPPORT_REPORT_SETTINGS.clientLogLines)}
            description="Макс. рядків client log у буфері браузера (10–500)."
          />
          <Input
            type="number"
            label="Рядків server console log"
            value={String(form.serverLogLines)}
            onValueChange={(v) => updateField('serverLogLines', Number(v) || DEFAULT_SUPPORT_REPORT_SETTINGS.serverLogLines)}
            description="Останні logServer/console рядки процесу Node (0–2000). Не meta_logs."
          />
          <Input
            type="number"
            label="Рядків server meta_logs"
            value={String(form.serverMetaLogLines)}
            onValueChange={(v) => updateField('serverMetaLogLines', Number(v) || DEFAULT_SUPPORT_REPORT_SETTINGS.serverMetaLogLines)}
            description="Останні записи meta_logs цього користувача з БД (0–50)."
          />
          <Input
            type="number"
            label="Rate limit (сек)"
            value={String(form.rateLimitSeconds)}
            onValueChange={(v) => updateField('rateLimitSeconds', Number(v) || DEFAULT_SUPPORT_REPORT_SETTINGS.rateLimitSeconds)}
            description="Мінімальна пауза між звітами від одного користувача."
          />
          <Input
            type="number"
            label="Макс. довжина коментаря"
            value={String(form.maxCommentLength)}
            onValueChange={(v) => updateField('maxCommentLength', Number(v) || DEFAULT_SUPPORT_REPORT_SETTINGS.maxCommentLength)}
            description="Ліміт символів у полі «Опишіть проблему»."
          />
          <Input
            type="number"
            label="Макс. скриншот (МБ)"
            value={String(form.maxScreenshotMb)}
            onValueChange={(v) => updateField('maxScreenshotMb', Number(v) || DEFAULT_SUPPORT_REPORT_SETTINGS.maxScreenshotMb)}
            description="Якщо PNG/JPEG більший — клієнт стискає перед відправкою."
          />
        </div>
      </CardBody>

      <CardFooter className="gap-2 justify-end">
        <Button
          variant="flat"
          onPress={handleTest}
          isDisabled={isSaving}
          startContent={
            isTesting ? (
              <DynamicIcon name="loader-circle" size={16} className="animate-spin" />
            ) : (
              <DynamicIcon name="send" size={16} />
            )
          }
        >
          Надіслати тестове повідомлення
        </Button>
        <Button
          color="primary"
          onPress={handleSave}
          isDisabled={!hasChanges || isSaving}
          startContent={
            isSaving ? (
              <DynamicIcon name="loader-circle" size={16} className="animate-spin" />
            ) : (
              <DynamicIcon name="save" size={16} />
            )
          }
        >
          Зберегти
        </Button>
      </CardFooter>
    </Card>
  );
};
