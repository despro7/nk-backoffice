import { useState } from 'react';
import { Button, Card, CardBody, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { NotificationConfigRevisionDto } from '@shared/types/notificationSettings';
import { ConfirmModal } from '@/components/modals/ConfirmModal';

interface HistoryTabProps {
  revisions: NotificationConfigRevisionDto[] | null;
  onRevert: (revision: NotificationConfigRevisionDto) => Promise<void>;
}

const ACTION_LABEL: Record<string, { label: string; color: 'default' | 'success' | 'warning' | 'danger' | 'primary' }> = {
  create: { label: 'Створено', color: 'success' },
  update: { label: 'Змінено', color: 'primary' },
  delete: { label: 'Видалено', color: 'danger' },
  reorder: { label: 'Порядок', color: 'default' },
  reset: { label: 'Скинуто', color: 'warning' },
  revert: { label: 'Відкат', color: 'warning' },
};

export function HistoryTab({ revisions, onRevert }: HistoryTabProps) {
  const [target, setTarget] = useState<NotificationConfigRevisionDto | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Card className="shadow-container">
      <CardBody className="p-3">
        <div className="divide-y divide-default-100 rounded-lg border border-default-200">
          {(revisions ?? []).map((r) => {
            const meta = ACTION_LABEL[r.action] ?? { label: r.action, color: 'default' as const };
            return (
              <div key={r.id} className="group px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip size="sm" variant="flat" color={meta.color} className="h-5 text-[11px]">{meta.label}</Chip>
                  <span className="text-xs text-default-500">{r.entity === 'rule' ? 'Правило' : 'Словник'}</span>
                  <span className="text-sm text-default-900">{r.label}</span>
                  <span className="ml-auto text-xs text-default-500">
                    {r.userName ?? 'Система'} · {new Date(r.createdAt).toLocaleString('uk-UA')}
                  </span>
                  <Button isIconOnly size="sm" variant="light" aria-label="Деталі" onPress={() => setOpen(open === r.id ? null : r.id)}>
                    <DynamicIcon name={open === r.id ? 'chevron-up' : 'code'} size={15} />
                  </Button>
                  <Button size="sm" variant="light" startContent={<DynamicIcon name="undo-2" size={14} />} onPress={() => setTarget(r)}>
                    Відкотити
                  </Button>
                </div>
                {open === r.id && (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {(['before', 'after'] as const).map((side) => (
                      <div key={side}>
                        <div className="mb-1 text-[11px] text-default-500">{side === 'before' ? 'Було' : 'Стало'}</div>
                        <pre className="max-h-64 overflow-auto rounded bg-default-50 p-2 font-mono text-[11px] text-default-700">
                          {r[side] ? JSON.stringify(r[side], null, 2) : '–'}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {revisions?.length === 0 && <p className="py-8 text-center text-sm text-default-400">Змін ще не було</p>}
          {revisions === null && <p className="py-8 text-center text-sm text-default-400">Завантаження…</p>}
        </div>
      </CardBody>
      <ConfirmModal
        isOpen={target !== null}
        title="Відкотити зміну?"
        message={target ? `Повернеться стан «${target.label}» до цієї зміни. Сам відкат теж запишеться в історію.` : ''}
        confirmText="Відкотити"
        onCancel={() => setTarget(null)}
        onConfirm={async () => {
          const r = target;
          setTarget(null);
          if (r) await onRevert(r);
        }}
      />
    </Card>
  );
}
