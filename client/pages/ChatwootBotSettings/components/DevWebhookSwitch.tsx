import { useCallback, useEffect, useState } from 'react';
import { Chip, Switch } from '@heroui/react';
import { ToastService } from '@/services/ToastService';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import {
  CHATWOOT_BOT_DEV_WEBHOOK_TTL_HOURS,
  type ChatwootBotDevWebhookChangeReason,
  type ChatwootBotDevWebhookStatus,
} from '@shared/types/chatwootBotDevWebhook';

const STATUS_POLL_MS = 60_000;

const REASON_LABELS: Record<ChatwootBotDevWebhookChangeReason, string> = {
  manual_on: 'увімкнено вручну',
  manual_off: 'вимкнено вручну',
  ttl_expired: `вимкнено автоматично після ${CHATWOOT_BOT_DEV_WEBHOOK_TTL_HOURS} год`,
  health_failed: 'вимкнено автоматично: тунель не відповідав',
  shutdown: 'вимкнено під час зупинки локального сервера',
};

function formatTime(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '–'
    : d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

/** Перемикач Chatwoot Agent Bot outgoing_url між продом і локальним BO (тунель chatwoot-dev). */
type Props = {
  /** Викликається після успішного перемикання (оновити health-алерт сторінки). */
  onChanged?: () => void;
};

export function DevWebhookSwitch({ onChanged }: Props) {
  const [status, setStatus] = useState<ChatwootBotDevWebhookStatus | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setStatus(await chatwootBotApi.getDevWebhookStatus());
    } catch (e) {
      console.error('[DevWebhookSwitch] status load failed', e);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const handleToggle = async (enabled: boolean): Promise<void> => {
    setBusy(true);
    try {
      const next = await chatwootBotApi.setDevWebhookEnabled(enabled);
      setStatus(next);
      onChanged?.();
      ToastService.show({
        title: enabled ? 'Вебхуки йдуть на локальний сервер' : 'Вебхуки повернуто на прод',
        description: next.liveOutgoingUrl ?? undefined,
        color: enabled ? 'warning' : 'success',
      });
    } catch (e) {
      ToastService.show({
        title: enabled ? 'Не вдалося увімкнути' : 'Не вдалося вимкнути',
        description: e instanceof Error ? e.message : String(e),
        color: 'danger',
      });
      void load();
    } finally {
      setBusy(false);
    }
  };

  const enabled = status?.enabled ?? false;
  const canToggle = Boolean(status) && !busy && (enabled || status?.canEnable === true);

  let caption = `Chatwoot шле вебхуки на цей Mac (npm run dev:chatwoot). Авто-вимкнення через ${CHATWOOT_BOT_DEV_WEBHOOK_TTL_HOURS} год.`;
  if (enabled) {
    caption = `Усі клієнти спілкуються з локальним ботом · до ${formatTime(status?.expiresAt ?? null)}`;
  } else if (status && !status.canEnable) {
    caption = 'Увімкнути можна лише з локального BO.';
  }

  const lastChange =
    !enabled && status?.lastChangeReason
      ? `Останнє: ${REASON_LABELS[status.lastChangeReason]} о ${formatTime(status.lastChangeAt)}`
      : null;
  const error = status?.agentBotError ?? status?.lastError ?? null;

  return (
    <div className="flex items-center gap-3">
      <Switch
        color="warning"
        isSelected={enabled}
        isDisabled={!canToggle}
        onValueChange={(v) => void handleToggle(v)}
        aria-label="Вебхуки Chatwoot на локальний сервер"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Вебхуки → локальний сервер</p>
          {enabled && (
            <Chip size="sm" color="warning" variant="flat">
              local
            </Chip>
          )}
        </div>
        <p className="text-xs text-default-500">{caption}</p>
        {lastChange && <p className="text-xs text-default-400">{lastChange}</p>}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
