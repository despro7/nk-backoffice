import { useEffect, useRef, useState } from 'react';
import { Button, Chip, Spinner, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import ResizableAppDrawer from '@/components/drawer/ResizableAppDrawer';
import { useApi } from '@/hooks/useApi';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { useWarehouseDocumentEditDrawer } from '@/features/warehouse-document-edit/context/WarehouseDocumentEditDrawerContext';
import { pluralize } from '@/lib/formatUtils';
import type { NotificationDocument, NotificationDocumentKind, NotificationDocumentTotals } from '@shared/types/notifications';

const DILOVOD_TYPE: Record<NotificationDocumentKind, string> = {
  release: 'documents.goodKit',
  movement: 'documents.goodMoving',
  writeOff: 'documents.goodWriteOff',
};

interface NotificationDocumentDrawerProps {
  /** meta_logs.id сповіщення; null – закрито. */
  logId: number | null;
  onClose: () => void;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-default-200 px-3 py-2">
      <div className="text-xs text-default-500">{label}</div>
      <div className="mt-0.5 text-sm text-default-900">{value || '–'}</div>
    </div>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const formatQty = (n: number | null) => (n == null ? '–' : n.toLocaleString('uk-UA', { maximumFractionDigits: 3 }));

/** «(N поз. / M страв / K порцій)», як «Склад комплекту» в картці товару. */
function totalsLabel({ positions, dishes, portions }: NotificationDocumentTotals): string {
  const parts = [`${positions} поз.`, `${formatQty(dishes)} ${pluralize(dishes, 'страва', 'страви', 'страв')}`];
  if (portions != null) parts.push(`${formatQty(portions)} ${pluralize(portions, 'порція', 'порції', 'порцій')}`);
  return `(${parts.join(' / ')})`;
}

/** Сира відповідь Діловода під спойлером. */
function RawErrorSpoiler({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-default-500 hover:text-default-800"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <DynamicIcon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        Технічна відповідь Діловода
      </button>
      {open && (
        <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-default-50 px-3 py-2 font-sans text-xs leading-relaxed text-default-600">
          {text}
        </pre>
      )}
    </div>
  );
}

/**
 * Складський документ зі сповіщення: локальний запис (або спроба відправки, якщо Діловод
 * документ не прийняв). Якщо документ є в Діловоді – кнопка відкриває його повний дровер.
 */
export function NotificationDocumentDrawer({ logId, onClose }: NotificationDocumentDrawerProps) {
  const { apiCall } = useApi();
  const { directories, loadDirectories } = useDilovodDirectories();
  const { open: openDilovodDocument } = useWarehouseDocumentEditDrawer();
  const [doc, setDoc] = useState<NotificationDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // apiCall нестабільний між рендерами (залежить від auth-контексту): тримаємо в ref,
  // інакше кожен рендер перезапускав би ефект і документ вантажився б по колу.
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const hasDirectories = directories != null;

  useEffect(() => {
    if (logId == null || hasDirectories) return;
    void loadDirectories().catch(() => undefined);
  }, [logId, hasDirectories, loadDirectories]);

  useEffect(() => {
    if (logId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    apiCallRef.current(`/api/notifications/${logId}/document`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.success) setError(json?.error || 'Не вдалося завантажити документ');
        else setDoc(json.data as NotificationDocument);
      })
      .catch(() => !cancelled && setError('Не вдалося завантажити документ'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [logId]);

  const storageName = (id: string | null) =>
    id ? directories?.storages?.find((s) => s.id === id)?.name ?? id : null;

  const storage = doc
    ? doc.storageToId
      ? `${storageName(doc.storageId) ?? '–'} → ${storageName(doc.storageToId)}`
      : storageName(doc.storageId)
    : null;

  const columns: Array<{ key: string; label: string; align?: 'center' | 'end'; width?: number }> = [
    { key: 'name', label: 'Товар' },
    { key: 'batch', label: 'Партія', align: 'center' },
    { key: 'qty', label: 'Кількість', align: 'end', width: 90 },
    ...(doc?.hasShortage
      ? [
          { key: 'stock', label: 'Залишок', align: 'end' as const, width: 90 },
          { key: 'missing', label: 'Бракує', align: 'end' as const, width: 90 },
        ]
      : []),
  ];

  return (
    <ResizableAppDrawer
      isOpen={logId != null}
      onClose={onClose}
      title={doc?.title ?? 'Документ'}
      titleExtra={doc?.status ? <Chip size="sm" variant="flat">{doc.status}</Chip> : undefined}
      initialPlacement="right"
      widthStorageKey="notification-document-drawer-width-v1"
      defaultWidth={760}
      minWidth={560}
      maxWidth={1100}
      resizeAriaLabel="Змінити ширину панелі документа"
      footer={
        <>
          {doc?.dilovodDocId && (
            <Button
              variant="flat"
              className="mr-auto"
              startContent={<DynamicIcon name="external-link" size={16} />}
              onPress={() =>
                openDilovodDocument({
                  dilovodDocumentId: doc.dilovodDocId!,
                  documentLabel: doc.title,
                  documentTypeId: DILOVOD_TYPE[doc.kind],
                })
              }
            >
              Документ у Діловоді
            </Button>
          )}
          <Button variant="light" onPress={onClose}>
            Закрити
          </Button>
        </>
      }
    >
      {loading ? (
        <Spinner label="Завантаження документа..." className="py-16" />
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : doc ? (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Fact label="Дата" value={formatDate(doc.date)} />
            <Fact label="Автор" value={doc.authorName} />
            <Fact label={doc.storageToId ? 'Склади' : 'Склад'} value={storage} />
          </div>

          {doc.error && doc.hasShortage ? (
            <section className="space-y-4">
              <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-danger-700">
                  <DynamicIcon name="circle-alert" size={15} />
                  Діловод не прийняв документ
                </div>
                {doc.errorSummary && <p className="mt-1 text-[13px] text-danger-700">{doc.errorSummary}</p>}
              </div>
              <RawErrorSpoiler text={doc.error} />
            </section>
          ) : doc.error ? (
            <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-danger-700">
                <DynamicIcon name="circle-alert" size={15} />
                Діловод не прийняв документ
              </div>
              <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-danger-700">{doc.error}</p>
            </div>
          ) : null}

          {doc.comment && (
            <div>
              <div className="mb-1 text-sm font-semibold text-default-900">Коментар</div>
              <p className="whitespace-pre-line text-sm text-default-700">{doc.comment}</p>
            </div>
          )}

          <section className="space-y-2">
            <div className="text-sm font-semibold text-default-900">
              Позиції
              {doc.items.length > 0 && <span className="ml-1.5 font-normal text-default-400">{totalsLabel(doc.totals)}</span>}
            </div>
            {doc.items.length === 0 ? (
              <p className="text-sm text-default-500">Позицій немає</p>
            ) : (
              <Table
                aria-label="Позиції документа"
                removeWrapper
                classNames={{
                  th: 'first:rounded-s-md last:rounded-e-md bg-default-100 text-xs text-default-500 h-8 px-2',
                  td: 'py-1.5 px-2',
                  tr: 'hover:bg-default-100/60',
                }}
              >
                <TableHeader columns={columns}>
                  {(col) => (
                    <TableColumn key={col.key} align={col.align} width={col.width}>
                      {col.label}
                    </TableColumn>
                  )}
                </TableHeader>
                <TableBody>
                  {doc.items.map((item, i) => {
                    const short = (item.missing ?? 0) > 0;
                    const cells = [
                      <TableCell key="name" className={`${item.isGroup ? 'font-semibold' : doc.kind === 'release' ? 'pl-6' : ''}`}>
                        {item.sku && (
                          <span className="mr-1.5 shrink-0 rounded bg-amber-200/60 px-1 py-0.5 text-tiny tabular-nums">{item.sku}</span>
                        )}
                        {item.name}
                      </TableCell>,
                      <TableCell key="batch" className="text-default-600">{item.batch || '–'}</TableCell>,
                      <TableCell key="qty" className="whitespace-nowrap text-right tabular-nums">{formatQty(item.quantity)}</TableCell>,
                    ];
                    if (doc.hasShortage) {
                      cells.push(
                        <TableCell key="stock" className={`whitespace-nowrap text-right tabular-nums ${short ? 'font-medium' : 'text-default-400'}`}>
                          {item.stock != null ? formatQty(item.stock) : '–'}
                        </TableCell>,
                        <TableCell key="missing" className={`whitespace-nowrap text-right tabular-nums ${short ? 'font-medium text-danger' : 'text-default-400'}`}>
                          {short ? formatQty(item.missing!) : '–'}
                        </TableCell>,
                      );
                    }
                    return <TableRow key={i}>{cells}</TableRow>;
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      ) : null}
    </ResizableAppDrawer>
  );
}
