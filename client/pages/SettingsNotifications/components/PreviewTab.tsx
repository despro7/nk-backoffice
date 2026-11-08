import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, Select, SelectItem } from '@heroui/react';
import type { NotificationFeedCounts, NotificationFeedItem, NotificationTab } from '@shared/types/notifications';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { notificationSettingsApi } from '@/services/NotificationSettingsService';

interface RoleOption {
  slug: string;
  name: string;
}

interface PreviewTabProps {
  roles: RoleOption[];
  /** Змінюється після збереження правил, щоб перечитати стрічку. */
  version: number;
  onEditRule: (item: NotificationFeedItem) => void;
}

const EMPTY: NotificationFeedCounts = { all: 0, mine: 0, errors: 0, archive: 0 };

export function PreviewTab({ roles, version, onEditRule }: PreviewTabProps) {
  const [role, setRole] = useState('admin');
  const [tab, setTab] = useState<NotificationTab>('all');
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [counts, setCounts] = useState<NotificationFeedCounts>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const feed = await notificationSettingsApi.previewFeed(role, tab);
      setItems(feed.data);
      setCounts(feed.counts);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [role, tab]);

  useEffect(() => {
    load();
  }, [load, version]);

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[440px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-2xl border border-default-200 shadow-xl">
        <NotificationPanel
          items={items}
          counts={counts}
          tab={tab}
          onTabChange={(t) => {
            setItems([]);
            setTab(t);
          }}
          loading={loading}
          isAdmin={role === 'admin'}
          showRuleHints
          onOpenReport={() => undefined}
          onOpen={() => undefined}
          onEditRule={onEditRule}
          listClassName="max-h-[640px]"
        />
      </div>
      <Card className="shadow-container">
        <CardBody className="gap-4">
          <Select
            size="sm"
            label="Переглянути як роль"
            className="max-w-xs"
            selectedKeys={[role]}
            onSelectionChange={(k) => {
              const v = Array.from(k)[0] as string;
              if (v) setRole(v);
            }}
          >
            {roles.map((r) => (
              <SelectItem key={r.slug}>{r.name}</SelectItem>
            ))}
          </Select>
          <div className="space-y-2 text-sm text-default-600">
            <p>Справжня стрічка за останні 30 днів, як її бачить обрана роль. Прочитане і архів – ваші.</p>
            <p>
              Адресні сповіщення (наприклад, специфікація на затвердження) показуються лише адресатам, тому тут видно тільки ті, що адресовані вам.
            </p>
            <p>Позначка «Без шаблону» – запис без правила; клік відкриває його в тестері.</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
