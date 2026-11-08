import { useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { useNotificationFeed } from '@/hooks/useNotificationFeed';

type DebugActions = ReturnType<typeof useNotificationFeed>['debug'];

function ToolRow({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-danger-100 py-2.5 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-default-900">{title}</div>
        <div className="text-xs text-default-500">{hint}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Інструменти Центру сповіщень, видимі лише в Debug Mode (низ вкладки налаштувань).
 * Діють на всіх користувачів, тому виділені кольором danger.
 */
export function NotificationDebugTools({ debug }: { debug: DebugActions }) {
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const run = async (key: string, fn: () => Promise<string | null>) => {
    setBusy(key);
    try {
      setResult(await fn());
    } finally {
      setBusy(null);
    }
  };

  const icon = (key: string, name: string) => (
    <DynamicIcon name={busy === key ? 'loader-2' : (name as any)} size={14} className={busy === key ? 'animate-spin' : ''} />
  );

  return (
    <section className="mt-5 rounded-xl border border-danger-200 bg-danger-50/40 px-3 pb-1 pt-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger-600">
        <DynamicIcon name="bug" size={13} />
        Debug Mode
      </div>
      <p className="mt-1 text-xs text-default-600">
        Блок видно лише в режимі налагодження. «Прочитати» і «Сховати» змінюють стан для всіх користувачів.
      </p>

      <ToolRow title="Пропустити найновіші" hint="Скільки останніх сповіщень не чіпати в діях нижче (offset)">
        <input
          type="number"
          min={0}
          value={offset}
          onChange={(e) => setOffset(Math.max(0, parseInt(e.target.value, 10) || 0))}
          className="h-7 w-14 rounded-md border border-danger-200 bg-white px-1.5 text-center text-xs outline-none focus:border-danger-400"
          aria-label="Кількість найновіших сповіщень, які пропустити"
        />
      </ToolRow>

      <ToolRow title="Прочитати все для всіх" hint="Позначає прочитаними всі сповіщення (крім пропущених) у кожного користувача">
        <Button size="sm" variant="flat" color="danger" className="h-7" isDisabled={busy !== null} startContent={icon('read', 'check-check')} onPress={() => run('read', () => debug.readAllGlobal(offset))}>
          Read all
        </Button>
      </ToolRow>

      <ToolRow title="Сховати все для всіх" hint="Переносить сповіщення (крім пропущених) в архів як «Вирішено» для всіх">
        <Button size="sm" variant="flat" color="danger" className="h-7" isDisabled={busy !== null} startContent={icon('hide', 'eye-off')} onPress={() => run('hide', () => debug.hideAllGlobal(offset))}>
          Hide all
        </Button>
      </ToolRow>

      <ToolRow title="Скинути мої позначки «прочитано»" hint="Усі ваші сповіщення знову стануть непрочитаними. Інших користувачів не зачіпає">
        {confirmReset ? (
          <>
            <Button size="sm" variant="light" className="h-7" onPress={() => setConfirmReset(false)}>
              Ні
            </Button>
            <Button
              size="sm"
              color="danger"
              className="h-7"
              isDisabled={busy !== null}
              startContent={icon('reset', 'rotate-ccw')}
              onPress={() => {
                setConfirmReset(false);
                void run('reset', debug.resetOwnRead);
              }}
            >
              Так, скинути
            </Button>
          </>
        ) : (
          <Button size="sm" variant="flat" color="danger" className="h-7" isDisabled={busy !== null} startContent={icon('reset', 'rotate-ccw')} onPress={() => setConfirmReset(true)}>
            Reset read
          </Button>
        )}
      </ToolRow>

      {result && <p className="pb-2 text-xs text-success-600">Готово: {result}</p>}
    </section>
  );
}
