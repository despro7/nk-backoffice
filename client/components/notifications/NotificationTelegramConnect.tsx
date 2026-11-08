import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { NotificationPrefsResponse } from '@shared/types/notifications';
import { useApi } from '@/hooks/useApi';

interface Props {
  telegram: NotificationPrefsResponse['telegram'];
  /** Перечитати налаштування (статус привʼязки). */
  onRefresh: () => Promise<void>;
}

/** Підключення особистого Telegram до бота сповіщень (deep link з одноразовим кодом). */
export function NotificationTelegramConnect({ telegram, onRefresh }: Props) {
  const { apiCall } = useApi();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (telegram.linked && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setLink(null);
    }
  }, [telegram.linked]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiCall('/api/notifications/telegram/link', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || 'Не вдалося створити посилання');
      setLink(json.url);
      window.open(json.url, '_blank', 'noopener');
      if (pollRef.current) clearInterval(pollRef.current);
      let ticks = 0;
      pollRef.current = setInterval(() => {
        ticks += 1;
        void onRefresh();
        if (ticks > 60 && pollRef.current) clearInterval(pollRef.current);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await apiCall('/api/notifications/telegram/link', { method: 'DELETE' });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  if (!telegram.configured) {
    return <p className="py-2 text-xs text-default-500">Бот сповіщень ще не налаштований адміністратором.</p>;
  }

  if (telegram.linked) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-default-100 py-2.5">
        <div className="flex items-center gap-2 text-sm text-default-900">
          <DynamicIcon name="circle-check" size={16} className="text-success" />
          Підключено{telegram.username ? ` (@${telegram.username})` : ''}
        </div>
        <Button size="sm" variant="light" color="danger" isDisabled={busy} onPress={disconnect}>
          Відключити
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      <Button
        size="sm"
        color="primary"
        startContent={<DynamicIcon name={busy ? 'loader-2' : 'send'} size={14} className={busy ? 'animate-spin' : ''} />}
        isDisabled={busy}
        onPress={connect}
      >
        Підключити Telegram
      </Button>
      {link && (
        <p className="text-xs text-default-500">
          Відкрийте бота і натисніть «Start». Якщо Telegram не відкрився:{' '}
          <a href={link} target="_blank" rel="noreferrer" className="text-primary underline">
            {link.replace('https://', '')}
          </a>
          . Посилання діє 15 хвилин.
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
