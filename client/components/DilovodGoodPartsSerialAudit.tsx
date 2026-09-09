import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Spinner,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { CATALOG_FINISHED_PRODUCTS_FOLDER_ID } from '@shared/types/catalog';
import {
  generateBatchSerialFromDate,
  isMissingDilovodDate,
} from '@shared/utils/dilovodBatchId';
import { ToastService } from '../services/ToastService';

type MissingSerialItem = {
  id: string;
  ownerId: string;
  ownerName: string;
  date: string;
  expiration: string;
  suggestedSerial: string | null;
  sku: string | null;
};

type AuditData = {
  scanned: number;
  missing: number;
  outsideFolder: number;
  folderId: string;
  folderName: string;
  ownerCount: number;
  items: MissingSerialItem[];
};

function formatDilovodDate(value: string): string {
  const raw = String(value || '').trim();
  if (isMissingDilovodDate(raw)) return '—';
  const day = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split('-');
    return `${d}.${m}.${y}`;
  }
  return raw;
}

export const DilovodGoodPartsSerialAudit: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(
        `/api/dilovod/good-parts/missing-serial?limit=500&folderId=${encodeURIComponent(CATALOG_FINISHED_PRODUCTS_FOLDER_ID)}`,
        {
          credentials: 'include',
        },
      );
      const json = await resp.json();
      if (!resp.ok || !json?.success) {
        throw new Error(json?.details || json?.error || 'Не вдалося виконати аудит');
      }
      const data = json.data as AuditData;
      setAudit(data);

      const nextDrafts: Record<string, string> = {};
      for (const item of data.items || []) {
        nextDrafts[item.id] = item.suggestedSerial || '';
      }
      setDrafts(nextDrafts);

      ToastService.show({
        title: data.missing === 0 ? 'Усе ок' : 'Знайдено партії без серійного №',
        description:
          data.missing === 0
            ? `«${data.folderName}»: перевірено ${data.scanned} партій`
            : `«${data.folderName}»: ${data.missing} без № (показано ${data.items.length})`,
        color: data.missing === 0 ? 'success' : 'warning',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      ToastService.show({
        title: 'Помилка аудиту',
        description: message,
        color: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSerial = useCallback(
    async (item: MissingSerialItem) => {
      const code = String(drafts[item.id] ?? '').trim();
      if (!code) {
        ToastService.show({
          title: 'Вкажіть серійний №',
          color: 'warning',
        });
        return;
      }

      setSavingId(item.id);
      try {
        const resp = await fetch(`/api/dilovod/good-parts/${encodeURIComponent(item.id)}/serial`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const json = await resp.json();
        if (!resp.ok || !json?.success) {
          throw new Error(json?.details || json?.error || 'Не вдалося зберегти');
        }

        setAudit((prev) => {
          if (!prev) return prev;
          const items = prev.items.filter((row) => row.id !== item.id);
          return {
            ...prev,
            missing: Math.max(0, prev.missing - 1),
            items,
          };
        });
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });

        ToastService.show({
          title: 'Серійний № збережено',
          description: `${code} → ${item.id}`,
          color: 'success',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ToastService.show({
          title: 'Помилка збереження',
          description: message,
          color: 'danger',
        });
      } finally {
        setSavingId(null);
      }
    },
    [drafts],
  );

  const applyDateSerial = useCallback((item: MissingSerialItem) => {
    const generated = generateBatchSerialFromDate(item.date);
    if (!generated) {
      ToastService.show({
        title: 'Немає дати партії',
        description: 'Неможливо згенерувати YMMDD без дати — критична помилка в Dilovod.',
        color: 'danger',
      });
      return;
    }
    setDrafts((prev) => ({ ...prev, [item.id]: generated }));
  }, []);

  const summary = useMemo(() => {
    if (!audit) return null;
    const withoutDate = audit.items.filter((item) => isMissingDilovodDate(item.date)).length;
    return (
      `Папка «${audit.folderName}» (${audit.ownerCount} товарів): ` +
      `без № ${audit.missing}, у списку ${audit.items.length}` +
      (withoutDate > 0 ? `; без дати ${withoutDate}` : '') +
      (audit.outsideFolder > 0 ? `; поза папкою ще ${audit.outsideFolder}` : '')
    );
  }, [audit]);

  return (
    <Card>
      <CardHeader className="border-b border-border-subtle">
        <DynamicIcon name="hash" size={20} className="text-text-secondary mr-2" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-text-primary">Партії без серійного номеру</h2>
        </div>
        <Button
          color="primary"
          variant="solid"
          onPress={runAudit}
          isLoading={loading}
          startContent={!loading ? <DynamicIcon name="search" size={16} /> : undefined}
        >
          {loading ? 'Перевірка…' : 'Знайти'}
        </Button>
      </CardHeader>
      <CardBody className="p-6 space-y-4">
        {error ? (
          <div className="text-sm text-danger">{error}</div>
        ) : null}

        {summary ? (
          <div>
            <p className="text-sm text-text-secondary">{summary}</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              Поле Dilovod <span className="font-mono">catalogs.goodParts.code</span>
              {' '}(«Серійний №»). Генерація: YMMDD з дати партії (напр. 05.09.2026 → 60905).
            </p>
          </div>
        ) : (
          <div className="text-sm text-text-secondary">
            Натисніть «Знайти» для аудиту партій без серійного № у «Готова продукція».
          </div>
        )}

        {loading && !audit ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            Завантаження з Dilovod…
          </div>
        ) : null}

        {audit && audit.items.length === 0 ? (
          <div className="rounded-[8px] border border-border-subtle bg-surface-page px-4 py-3 text-sm text-text-secondary">
            Порожніх серійних номерів не знайдено.
          </div>
        ) : null}

        {audit && audit.items.length > 0 ? (
          <div className="overflow-x-auto rounded-[8px] border border-border-subtle">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-page text-left text-xs text-text-secondary">
                <tr className="divide-x border-b [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium [&>th]:bg-neutral-200/50">
                  <th>Товар</th>
                  <th>Дата</th>
                  <th>ID партії</th>
                  <th className="w-[5%] min-w-60">Серійний №</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {audit.items.map((item) => {
                  const missingDate = isMissingDilovodDate(item.date);
                  const dateSerial = generateBatchSerialFromDate(item.date);
                  const isSaving = savingId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className={`divide-x ${missingDate ? 'bg-danger-50/80' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-text-primary">{item.ownerName}</div>
                        <div className="text-xs text-text-secondary font-mono">
                          {item.sku ? `SKU ${item.sku}` : item.ownerId || '—'}
                        </div>
                        {missingDate ? (
                          <div className="mt-1 text-xs font-medium text-danger">
                            Критично: немає дати партії
                          </div>
                        ) : null}
                      </td>
                      <td
                        className={`px-3 py-2 whitespace-nowrap ${
                          missingDate ? 'text-danger font-medium' : 'text-text-secondary'
                        }`}
                      >
                        <div>{missingDate ? 'немає дати' : formatDilovodDate(item.date)}</div>
                        {item.expiration && !isMissingDilovodDate(item.expiration) ? (
                          <div className={`text-xs ${missingDate ? 'text-danger' : ''}`}>
                            до {formatDilovodDate(item.expiration)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-text-secondary break-all">
                        {item.id}
                      </td>
                      <td className="px-3 py-2 min-w-[12rem]">
                        <Input
                          size="sm"
                          classNames={{
                            input: 'placeholder:opacity-50',
                            inputWrapper: 'pr-0'
                          }}
                          aria-label={`Серійний номер для ${item.id}`}
                          placeholder={dateSerial || 'потрібна дата партії'}
                          value={drafts[item.id] ?? ''}
                          onValueChange={(value) =>
                            setDrafts((prev) => ({ ...prev, [item.id]: value }))
                          }
                          isDisabled={isSaving}
                          isInvalid={missingDate}
                          endContent={
                            <Tooltip
                              content={
                                missingDate
                                  ? 'Немає дати — генерація номеру партії неможлива'
                                  : `Згенерувати номер (на підставі дати)`
                              }
                              color="default"
                              placement="top-end"
                              showArrow={true}
                              delay={200}
                              classNames={{
                                base: 'before:rounded-[3px] before:bg-blue-500 before:z-[10]',
                                content: 'bg-blue-500 text-white rounded-sm',
                              }}
                            >
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                color="default"
                                className="text-default-500 hover:text-blue-600/75 hover:bg-blue-600/10!"
                                aria-label="Генерація серійного номера з дати"
                                onPress={() => applyDateSerial(item)}
                                isDisabled={isSaving || missingDate}
                              >
                                <DynamicIcon name="dices" size={16} />
                              </Button>
                            </Tooltip>
                          }
                        />
                        {item.suggestedSerial ? (
                          <button
                            type="button"
                            className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                            onClick={() =>
                              setDrafts((prev) => ({
                                ...prev,
                                [item.id]: item.suggestedSerial || '',
                              }))
                            }
                          >
                            підставити з каталогу: {item.suggestedSerial}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          color="primary"
                          onPress={() => saveSerial(item)}
                          isLoading={isSaving}
                          isDisabled={!String(drafts[item.id] ?? '').trim()}
                        >
                          Зберегти
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
};

export default DilovodGoodPartsSerialAudit;
