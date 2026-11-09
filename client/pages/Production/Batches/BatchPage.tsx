import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  CardBody,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Textarea,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Link, useParams } from 'react-router-dom';
import { BaseModal } from '@/components/modals/BaseModal';
import { NumberInputFromNumber } from '@/components/NumberInput';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { ToastService } from '@/services/ToastService';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  PRODUCTION_BATCH_STATUS_LABELS,
  type ProductionBatchDetailDto,
  type ProductionBatchEventDto,
  type ProductionBatchLineDto,
} from '@shared/types/production';
import { useProductionBatch, useProductionBatchActions } from '../useProductionBatches';
import { BATCH_STEPS, BatchStatusChip, formatBatchDate, formatQty } from '../components/batchUi';
import { formatDateTime } from '../components/techCardUi';
import { formatMinutes } from '../components/techCardRecipe';
import { BatchDatePicker } from '../components/BatchDatePicker';

const TABLE_CLASS_NAMES = {
  table: 'min-w-[520px]',
  th: 'bg-default-100 text-default-600 text-xs font-semibold first:rounded-l-md last:rounded-r-md',
  td: 'text-sm py-2 align-top',
  tr: 'border-b border-default-200/70 last:border-b-0',
};

function Section({ icon, title, aside, children }: { icon: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-default-900">
          <DynamicIcon name={icon as never} size={16} className="text-default-500" />
          {title}
        </h3>
        {aside && <div className="ml-auto text-sm text-default-500">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function qtyWithUnit(line: ProductionBatchLineDto): string {
  return `${formatQty(line.plannedQty)}${line.unitName ? ` ${line.unitName}` : ''}`;
}

function RawLinesTable({ lines }: { lines: ProductionBatchLineDto[] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <Table aria-label="Сировина варки" removeWrapper classNames={TABLE_CLASS_NAMES}>
        <TableHeader>
          <TableColumn>Інгредієнт</TableColumn>
          <TableColumn className="text-right">План</TableColumn>
          <TableColumn className="text-right">Нетто</TableColumn>
          <TableColumn className="text-right">Брутто</TableColumn>
        </TableHeader>
        <TableBody emptyContent="Немає сировини">
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{l.name}</TableCell>
              <TableCell className="text-right tabular-nums">{qtyWithUnit(l)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {l.plannedNetKg != null ? `${formatQty(l.plannedNetKg)} кг` : '–'}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {l.plannedGrossKg != null ? `${formatQty(l.plannedGrossKg)} кг` : '–'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PackagingLinesTable({ lines }: { lines: ProductionBatchLineDto[] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <Table aria-label="Пакування варки" removeWrapper classNames={{ ...TABLE_CLASS_NAMES, table: 'min-w-[360px]' }}>
        <TableHeader>
          <TableColumn>Матеріал</TableColumn>
          <TableColumn className="text-right">План</TableColumn>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{l.name}</TableCell>
              <TableCell className="text-right tabular-nums">{qtyWithUnit(l)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function eventText(e: ProductionBatchEventDto): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case 'created':
      return `Варку створено: ${p.plannedPortions ?? '–'} порцій на ${formatBatchDate(String(p.plannedDate ?? ''))}`;
    case 'planChanged': {
      const from = (p.from ?? {}) as Record<string, unknown>;
      const to = (p.to ?? {}) as Record<string, unknown>;
      const parts = [
        from.plannedPortions !== to.plannedPortions ? `${from.plannedPortions} → ${to.plannedPortions} порцій` : null,
        from.plannedDate !== to.plannedDate
          ? `${formatBatchDate(String(from.plannedDate ?? ''))} → ${formatBatchDate(String(to.plannedDate ?? ''))}`
          : null,
      ].filter(Boolean);
      return parts.length > 0 ? `План змінено: ${parts.join(', ')}` : 'Коментар до плану змінено';
    }
    case 'cancelled':
      return `Варку скасовано: ${String(p.reason ?? '')}`;
    default:
      return e.type;
  }
}

function Timeline({ events }: { events: ProductionBatchEventDto[] }) {
  if (events.length === 0) return <p className="text-sm text-default-500">Подій ще немає.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-2.5">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-default-300" />
          <div className="min-w-0">
            <p className="text-sm text-default-800">{eventText(e)}</p>
            <p className="text-xs text-default-500">
              {[e.userName, formatDateTime(e.at)].filter(Boolean).join(', ')}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Крок 1: план варки (редагується в чернетці) і планові кількості. */
function PlanStep({ batch, canEdit }: { batch: ProductionBatchDetailDto; canEdit: boolean }) {
  const actions = useProductionBatchActions();
  const editable = canEdit && batch.status === 'draft';
  const [portions, setPortions] = useState(batch.plannedPortions);
  const [date, setDate] = useState(batch.plannedDate);
  const [comment, setComment] = useState(batch.comment ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPortions(batch.plannedPortions);
    setDate(batch.plannedDate);
    setComment(batch.comment ?? '');
  }, [batch.plannedPortions, batch.plannedDate, batch.comment]);

  const dirty =
    portions !== batch.plannedPortions || date !== batch.plannedDate || comment.trim() !== (batch.comment ?? '');

  const save = async () => {
    setBusy(true);
    try {
      await actions.updatePlan(batch.id, { plannedPortions: portions, plannedDate: date, comment });
      ToastService.show({ title: 'План варки збережено', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося зберегти план',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {editable ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:max-w-md">
            <NumberInputFromNumber label="План порцій" value={portions} min={1} decimalPlaces={0} onChange={setPortions} />
            <BatchDatePicker label="Плановий день" value={date} onChange={setDate} isRequired />
          </div>
          <Textarea label="Коментар" minRows={1} value={comment} onValueChange={setComment} className="md:max-w-xl" />
          {dirty && (
            <div className="flex gap-2">
              <Button
                color="primary"
                isDisabled={busy}
                startContent={<DynamicIcon name={busy ? 'loader-2' : 'save'} size={14} className={busy ? 'animate-spin' : ''} />}
                onPress={() => void save()}
              >
                Зберегти план
              </Button>
              <Button
                variant="flat"
                isDisabled={busy}
                onPress={() => {
                  setPortions(batch.plannedPortions);
                  setDate(batch.plannedDate);
                  setComment(batch.comment ?? '');
                }}
              >
                Скасувати
              </Button>
            </div>
          )}
          <p className="text-xs text-default-500">
            Після зміни плану порцій планові кількості сировини й пакування перераховуються за рецептом варки.
          </p>
        </>
      ) : (
        <p className="text-sm text-default-700">
          {batch.plannedPortions} порцій на {formatBatchDate(batch.plannedDate)}
          {batch.comment && <span className="text-default-500"> · {batch.comment}</span>}
        </p>
      )}
    </div>
  );
}

/** Вертикальний степер: пройдені кроки, поточний (з формою), майбутні. */
function Stepper({ batch, canEdit }: { batch: ProductionBatchDetailDto; canEdit: boolean }) {
  const currentIdx = batch.status === 'cancelled' ? -1 : BATCH_STEPS.findIndex((s) => s.status === batch.status);
  return (
    <ol className="flex flex-col">
      {BATCH_STEPS.map((step, idx) => {
        const done = currentIdx > idx;
        const current = currentIdx === idx;
        return (
          <li key={step.status} className="relative flex gap-3 pb-5 last:pb-0">
            {idx < BATCH_STEPS.length - 1 && (
              <span className="absolute left-[13px] top-7 bottom-0 w-px bg-default-200" aria-hidden />
            )}
            <span
              className={`relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? 'bg-success-100 text-success-700'
                  : current
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-default-100 text-default-400'
              }`}
            >
              {done ? <DynamicIcon name="check" size={14} /> : idx + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`text-sm font-semibold ${current ? 'text-default-900' : done ? 'text-default-700' : 'text-default-400'}`}>
                {PRODUCTION_BATCH_STATUS_LABELS[step.status]}
              </p>
              <p className="text-xs text-default-500">{step.hint}</p>
              {current && step.status === 'draft' && (
                <div className="mt-3">
                  <PlanStep batch={batch} canEdit={canEdit} />
                </div>
              )}
              {current && step.status !== 'draft' && (
                <p className="mt-2 text-xs text-default-400">Форма цього кроку буде в наступному оновленні.</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Сторінка варки `/production/batches/:id`. */
export default function BatchPage() {
  const { id = '' } = useParams<{ id: string }>();
  const batchId = Number(id);
  const { data, loading, error } = useProductionBatch(Number.isInteger(batchId) ? batchId : null);
  const { hasPermission } = useRoleAccess();
  const canCreate = hasPermission(PERMISSIONS.ACTION_PRODUCTION_BATCHES_CREATE);
  const actions = useProductionBatchActions();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (!data) return;
    if (!reason.trim()) {
      ToastService.show({ title: 'Вкажіть причину', color: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await actions.cancel(data.id, reason);
      ToastService.show({ title: 'Варку скасовано', color: 'success' });
      setCancelOpen(false);
      setReason('');
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося скасувати варку',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const raw = data?.lines.filter((l) => l.kind === 'raw') ?? [];
  const packaging = data?.lines.filter((l) => l.kind === 'packaging') ?? [];
  const canCancel = canCreate && (data?.status === 'draft' || data?.status === 'issued');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Button as={Link} to="/production/batches" variant="light" isIconOnly aria-label="До списку варок" title="До списку варок">
          <DynamicIcon name="arrow-left" size={18} />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-default-900">Варка {data?.number ?? ''}</h1>
            {data && <BatchStatusChip status={data.status} />}
          </div>
          {data && (
            <div className="scrollbar-hide flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap text-xs text-default-500 md:flex-wrap">
              <Link to={`/production/techcards/${encodeURIComponent(data.goodId)}`} className="font-medium text-primary">
                {data.goodName}
              </Link>
              <span>·</span>
              <span>техкарта v{data.techCardVersion}</span>
              {data.specVersion != null && (
                <>
                  <span>·</span>
                  <span>специфікація v{data.specVersion}</span>
                </>
              )}
              <span>·</span>
              <span>
                {[data.createdByName, formatDateTime(data.createdAt)].filter(Boolean).join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex h-40 items-center justify-center">
          <Spinner size="sm" />
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            {data.status === 'cancelled' && (
              <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
                Варку скасовано{data.cancelledByName ? ` (${data.cancelledByName}, ${formatDateTime(data.cancelledAt)})` : ''}
                {data.cancelReason ? `: «${data.cancelReason}»` : ''}.
              </div>
            )}
            <Card className="rounded-lg shadow-none">
              <CardBody className="p-4">
                <Stepper batch={data} canEdit={canCreate} />
              </CardBody>
            </Card>
            <Card className="rounded-lg shadow-none">
              <CardBody className="flex flex-col gap-5 p-4">
                <Section icon="list" title="Сировина" aside={`на ${data.plannedPortions} порцій`}>
                  <RawLinesTable lines={raw} />
                </Section>
                {packaging.length > 0 && (
                  <Section icon="package" title="Пакування">
                    <PackagingLinesTable lines={packaging} />
                  </Section>
                )}
                {data.stages.length > 0 && (
                  <Section icon="list-ordered" title="Етапи">
                    <ol className="flex flex-col gap-1.5">
                      {data.stages.map((s, idx) => (
                        <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="font-medium text-default-900">
                            {idx + 1}. {s.name}
                          </span>
                          <span className="text-xs text-default-500">
                            {[
                              s.plannedOffsetMin ? `старт +${formatMinutes(s.plannedOffsetMin)}` : null,
                              s.plannedDurationMin ? formatMinutes(s.plannedDurationMin) : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}
              </CardBody>
            </Card>
            {canCancel && (
              <div className="flex">
                <Button
                  variant="light"
                  color="danger"
                  startContent={<DynamicIcon name="ban" size={14} />}
                  onPress={() => setCancelOpen(true)}
                >
                  Скасувати варку
                </Button>
              </div>
            )}
          </div>
          <Card className="h-fit rounded-lg shadow-none">
            <CardBody className="flex flex-col gap-3 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-default-900">
                <DynamicIcon name="history" size={16} className="text-default-500" />
                Таймлайн
              </h3>
              <Timeline events={data.events} />
            </CardBody>
          </Card>
        </div>
      )}

      <BaseModal
        isOpen={cancelOpen}
        title="Скасувати варку"
        message={
          <Textarea autoFocus label="Причина" minRows={2} value={reason} onValueChange={setReason} />
        }
        confirmText="Скасувати варку"
        confirmColor="danger"
        cancelText="Не скасовувати"
        confirmLoading={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  );
}
