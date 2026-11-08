import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Chip, Input, Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { NotificationTelegramAdminState } from '@shared/types/notificationSettings';
import { notificationSettingsApi } from '@/services/NotificationSettingsService';
import { ToastService } from '@/services/ToastService';

const STATUS_LABEL: Record<string, string> = {
  sent: 'Надіслано',
  pending: 'У черзі',
  sending: 'Надсилається',
  failed: 'Помилки',
};

export function TelegramTab() {
  const [state, setState] = useState<NotificationTelegramAdminState | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await notificationSettingsApi.telegram());
    } catch (err) {
      ToastService.show({ title: 'Не вдалося завантажити Telegram', description: String(err), color: 'danger' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && typeof res === 'object' && 'links' in (res as object)) setState(res as NotificationTelegramAdminState);
      else await load();
      if (success) ToastService.show({ title: success, color: 'success' });
    } catch (err) {
      ToastService.show({ title: 'Помилка', description: err instanceof Error ? err.message : String(err), color: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  if (!state) return <p className="py-10 text-center text-sm text-default-400">Завантаження…</p>;

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      <Card className="shadow-container">
        <CardHeader className="flex-col items-start gap-1">
          <span className="text-sm font-semibold">Бот сповіщень</span>
          <span className="text-xs text-default-500">
            Окремий бот, на який підписуються працівники. Створіть його в @BotFather і вставте токен. Що саме дублюється в Telegram, задається
            галочками «Telegram» у матриці ролі.
          </span>
        </CardHeader>
        <CardBody className="gap-4">
          <div className="flex items-end gap-2">
            <Input
              id="tg-token"
              size="sm"
              label="Токен бота"
              placeholder={state.botTokenMasked || '123456:ABC…'}
              value={token}
              onValueChange={setToken}
              type="password"
              autoComplete="off"
            />
            <Button
              color="primary"
              isDisabled={!token.trim() || busy !== null}
              startContent={<DynamicIcon name={busy === 'token' ? 'loader-2' : 'save'} size={16} className={busy === 'token' ? 'animate-spin' : ''} />}
              onPress={() =>
                run('token', async () => {
                  const res = await notificationSettingsApi.saveTelegram({ botToken: token.trim() });
                  setToken('');
                  return res;
                }, 'Токен перевірено і збережено')
              }
            >
              Зберегти
            </Button>
          </div>
          {state.configured && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                Бот: <b>@{state.botUsername ?? '?'}</b>
              </span>
              <Switch
                size="sm"
                isSelected={state.enabled}
                isDisabled={busy !== null}
                onValueChange={(enabled) => run('enabled', () => notificationSettingsApi.saveTelegram({ enabled }))}
              >
                Розсилка увімкнена
              </Switch>
              <Button
                size="sm"
                variant="flat"
                isDisabled={busy !== null}
                startContent={<DynamicIcon name={busy === 'test' ? 'loader-2' : 'send'} size={14} className={busy === 'test' ? 'animate-spin' : ''} />}
                onPress={() => run('test', () => notificationSettingsApi.telegramTest(), 'Тестове повідомлення надіслано')}
              >
                Надіслати собі тест
              </Button>
            </div>
          )}
          {!state.workerActive && (
            <div className="rounded-lg bg-warning-50 p-3 text-xs text-warning-700">
              На цьому сервері розсилка не працює (режим розробки). Вона працює на робочому сервері; локально її вмикає змінна
              NOTIFICATION_TG_WORKER=1.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <Chip key={key} size="sm" variant="flat" color={key === 'failed' ? 'danger' : key === 'sent' ? 'success' : 'default'}>
                {label}: {state.stats[key] ?? 0}
              </Chip>
            ))}
            <span className="self-center text-xs text-default-500">за 7 днів</span>
          </div>
          {state.lastErrors.length > 0 && (
            <div className="space-y-1 text-xs text-danger-700">
              {state.lastErrors.map((e) => (
                <div key={e.id}>
                  {new Date(e.createdAt).toLocaleString('uk-UA')}: {e.lastError}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="shadow-container">
        <CardHeader className="flex-col items-start gap-1">
          <span className="text-sm font-semibold">Підключені працівники</span>
          <span className="text-xs text-default-500">
            Працівник підключається сам: дзвіночок → шестерня → «Підключити Telegram». Відключити можна тут або командою /stop у боті.
          </span>
        </CardHeader>
        <CardBody className="p-3">
          <div className="divide-y divide-default-100 rounded-lg border border-default-200">
            {state.links.map((l) => (
              <div key={l.userId} className="group flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-default-900">{l.name}</div>
                  <div className="text-xs text-default-500">
                    {[l.roleName, l.telegramUsername ? `@${l.telegramUsername}` : null, l.linkedAt ? new Date(l.linkedAt).toLocaleDateString('uk-UA') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  className="text-rose-600 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Відключити"
                  isDisabled={busy !== null}
                  onPress={() => run(`unlink-${l.userId}`, () => notificationSettingsApi.unlinkTelegram(l.userId))}
                >
                  <DynamicIcon name="unlink" size={16} />
                </Button>
              </div>
            ))}
            {state.links.length === 0 && <p className="py-8 text-center text-sm text-default-400">Ще ніхто не підключився</p>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
