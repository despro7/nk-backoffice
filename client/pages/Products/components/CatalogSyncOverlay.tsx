import { useEffect, useState } from 'react';
import { Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

export type CatalogSyncOp = 'branch' | 'stock';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s} с`;
}

function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [active]);
  return seconds;
}

interface CatalogSyncOverlayProps {
  op: CatalogSyncOp | null;
  folderName?: string;
}

const COPY: Record<
  CatalogSyncOp,
  { title: string; steps: string[]; icon: 'folder-sync' | 'boxes'; tone: string }
> = {
  branch: {
    title: 'Синхронізація гілки',
    steps: ['Структура папки з Dilovod', 'Проекція в кеш products'],
    icon: 'folder-sync',
    tone: 'border-lime-300/80 bg-lime-50/95 text-lime-950',
  },
  stock: {
    title: 'Оновлення залишків',
    steps: ['Dilovod → Backoffice', 'Експорт у SalesDrive', 'Тригер WooCommerce'],
    icon: 'boxes',
    tone: 'border-amber-300/80 bg-amber-50/95 text-amber-950',
  },
};

export function CatalogSyncOverlay({ op, folderName }: CatalogSyncOverlayProps) {
  const active = Boolean(op);
  const elapsed = useElapsed(active);
  if (!op) return null;

  const copy = COPY[op];
  const subtitle =
    op === 'branch' && folderName
      ? `Папка «${folderName}» та всі вкладені рівні`
      : 'Зачекайте, доки завершиться повний ланцюжок';

  return (
    <div
      className={`w-full rounded-xl border px-4 py-3 shadow-sm ${copy.tone}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80">
            <Spinner size="sm" color={op === 'stock' ? 'warning' : 'success'} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{copy.title}</p>
              <span className="shrink-0 tabular-nums text-xs opacity-70">
                {formatElapsed(elapsed)}
              </span>
            </div>
            <p className="mt-0.5 text-sm opacity-80">{subtitle}</p>
            <ol className="mt-2 space-y-1 text-sm">
              {copy.steps.map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <DynamicIcon name={copy.icon} size={13} className="shrink-0 opacity-70" />
                  <span>
                    {i + 1}. {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
    </div>
  );
}
