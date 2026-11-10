import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Card, CardBody, Spinner, Textarea } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Link, useParams } from 'react-router-dom';
import { BaseModal } from '@/components/modals/BaseModal';
import { NumberInputFromNumber } from '@/components/NumberInput';
import { useAuth } from '@/contexts/auth-context';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { ToastService } from '@/services/ToastService';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  PRODUCTION_BATCH_STATUS_LABELS,
  type ProductionBatchDetailDto,
  type ProductionBatchEventDto,
  type ProductionBatchStatus,
} from '@shared/types/production';
import { useProductionBatch, useProductionBatchActions } from '../useProductionBatches';
import { BATCH_STEPS, BatchStatusChip, formatBatchDate, formatTemp } from '../components/batchUi';
import { BatchLinesTable, useIssueDraft, type BatchLinesMode, type IssueDraft } from '../components/BatchLinesTable';
import { AcceptStepPanel, CookingStepPanel, IssueStepPanel, SignatureLine } from '../components/BatchStepPanels';
import {
  CloseStepPanel,
  FactSummary,
  FinishedStepPanel,
  OutputLinesTable,
  OutputStepPanel,
  useOutputDraft,
  type OutputDraft,
} from '../components/BatchOutput';
import { cn } from '@/lib/utils';
import { BatchStagesGantt } from '../components/BatchStagesGantt';
import { formatDateTime } from '../components/techCardUi';
import { BatchDatePicker } from '../components/BatchDatePicker';
import { BatchActButton } from '../batchExport/BatchActButton';

function Section({ className, icon, title, aside, children }: { className?: string; icon: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn('space-y-3', className)}>
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

const STEP_LABEL: Record<string, string> = {
  issued: 'Видача сировини',
  accepted: 'Прийом на виробництво',
  output: 'Факт виходу',
  finished: 'Прийом на склад ГП',
};

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
    case 'stockRefreshed':
      return 'Облікові залишки оновлено з Dilovod';
    case 'issued':
      return Number(p.shortages) > 0 ? `Сировину видано, нестача: ${p.shortages} поз.` : 'Сировину видано';
    case 'accepted':
      return `Прийнято на виробництво${p.comment ? `: ${String(p.comment)}` : ''}`;
    case 'stageStarted':
      return `Етап «${String(p.stage ?? '')}» розпочато`;
    case 'stageFinished':
      return `Етап «${String(p.stage ?? '')}» завершено${p.actualTemp ? `, t\u00A0${formatTemp(String(p.actualTemp))}` : ''}`;
    case 'stageUndone':
      return `Етап «${String(p.stage ?? '')}»: відмінено ${p.what === 'finish' ? 'фініш' : 'старт'}`;
    case 'stageTimeEdited': {
      const at = (v: unknown) => (typeof v === 'string' && v ? formatDateTime(v) : '–');
      return `Етап «${String(p.stage ?? '')}»: час змінено (${at(p.startedAt)} – ${at(p.finishedAt)})`;
    }
    case 'output':
      return `Факт виходу: ${p.portionsGood ?? '–'} порцій на ГП${Number(p.portionsReject) > 0 ? `, брак ${p.portionsReject}` : ''}${
        Number(p.unfinishedStages) > 0 ? ` (незавершених етапів: ${p.unfinishedStages})` : ''
      }`;
    case 'finished':
      return `Прийнято на склад ГП${p.comment ? `: ${String(p.comment)}` : ''}`;
    case 'closed':
      return 'Варку закрито';
    case 'signatureRevoked':
      return `Підпис «${STEP_LABEL[String(p.step)] ?? String(p.step)}» відкликано: ${String(p.comment ?? '')}`;
    default:
      return e.type;
  }
}

function Timeline({ events }: { events: ProductionBatchEventDto[] }) {
  if (events.length === 0) return <p className="text-sm text-default-500">Подій ще немає.</p>;
  // Хронологічно: історія варки читається згори вниз, як кроки; найновіша подія внизу і виділена.
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
  return (
    <ol className="flex flex-col">
      {ordered.map((e, idx) => (
        <li key={e.id} className="relative flex gap-2.5 pb-3 last:pb-0">
          {idx < ordered.length - 1 && (
            <span className="absolute top-3.5 -bottom-1.5 left-[3.5px] w-px bg-default-200" aria-hidden />
          )}
          <span
            className={cn(
              'relative mt-1.5 size-2 shrink-0 rounded-full',
              idx === ordered.length - 1 ? 'bg-primary ring-4 ring-primary/15' : 'bg-default-300',
            )}
          />
          <div className="min-w-0">
            <p className="text-sm text-default-800">{eventText(e)}</p>
            <p className="text-xs text-default-400">
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

/**
 * Крок, дія якого очікується зараз: видача з чернетки, прийом після видачі, готування після прийому
 * (без етапів – одразу факт виходу), факт виходу під час готування, далі склад ГП і закриття.
 */
function actionStepIndex(batch: ProductionBatchDetailDto): number {
  const idx = (status: ProductionBatchStatus) => BATCH_STEPS.findIndex((s) => s.status === status);
  switch (batch.status) {
    case 'cancelled':
      return -1;
    case 'closed':
      return BATCH_STEPS.length;
    case 'accepted':
      return batch.stages.length > 0 ? idx('cooking') : idx('output');
    default:
      return idx(batch.status) + 1;
  }
}

interface StepperProps {
  batch: ProductionBatchDetailDto;
  draft: IssueDraft;
  outputDraft: OutputDraft;
  userId: number | null;
  can: { create: boolean; issue: boolean; accept: boolean; cook: boolean; acceptFinished: boolean; revokeAny: boolean };
}

/** Вертикальний степер: пройдені кроки (з підписами), поточний (з діями), майбутні. */
function Stepper({ batch, draft, outputDraft, userId, can }: StepperProps) {
  const actionIdx = actionStepIndex(batch);
  const activeSignatures = batch.signatures.filter((s) => !s.revokedAt);
  const lastSignature = activeSignatures[activeSignatures.length - 1] ?? null;

  const waiting = (text: string) => <p className="mt-2 text-xs text-default-400">{text}</p>;

  const body = (status: ProductionBatchStatus, current: boolean, done: boolean) => {
    if (status === 'draft') {
      return batch.status === 'draft' ? (
        <div className="mt-3">
          <PlanStep batch={batch} canEdit={can.create} />
        </div>
      ) : null;
    }
    // Готування лишається відкритим, поки не підписано факт виходу
    if (status === 'cooking' && (batch.status === 'accepted' || batch.status === 'cooking') && batch.stages.length > 0) {
      return (
        <div className="mt-3">
          <CookingStepPanel batch={batch} canCook={can.cook} />
        </div>
      );
    }
    if (done) {
      const sig = activeSignatures.find((x) => x.step === status);
      const revocable =
        sig != null &&
        batch.status !== 'closed' &&
        lastSignature?.id === sig.id &&
        batch.status === status &&
        (can.revokeAny || (userId != null && sig.userId === userId));
      return (
        <>
          {sig && <SignatureLine batch={batch} signature={sig} canRevoke={revocable} />}
          {status === 'output' && <FactSummary batch={batch} />}
          {status === 'closed' && batch.closedAt && (
            <p className="mt-1.5 text-xs text-default-500">{formatDateTime(batch.closedAt)}</p>
          )}
        </>
      );
    }
    if (!current) return null;
    switch (status) {
      case 'issued':
        return can.issue ? (
          <div className="mt-3">
            <IssueStepPanel batch={batch} draft={draft} />
          </div>
        ) : (
          waiting('Очікує видачі комірником.')
        );
      case 'accepted':
        return can.accept ? (
          <div className="mt-3">
            <AcceptStepPanel batch={batch} />
          </div>
        ) : (
          waiting('Очікує прийому на виробництво.')
        );
      case 'output':
        return can.accept ? (
          <div className="mt-3">
            <OutputStepPanel batch={batch} draft={outputDraft} />
          </div>
        ) : (
          waiting('Очікує факту виходу.')
        );
      case 'finished':
        return can.acceptFinished ? (
          <div className="mt-3">
            <FinishedStepPanel batch={batch} />
          </div>
        ) : (
          waiting('Очікує прийому на склад ГП.')
        );
      case 'closed':
        return can.create ? <CloseStepPanel batch={batch} /> : waiting('Очікує закриття.');
      default:
        return null;
    }
  };

  return (
    <ol className="flex flex-col">
      {BATCH_STEPS.map((step, idx) => {
        const done = actionIdx > idx;
        const current = actionIdx === idx;
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
              {body(step.status, current, done)}
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
  const { user } = useAuth();
  const can = {
    create: hasPermission(PERMISSIONS.ACTION_PRODUCTION_BATCHES_CREATE),
    issue: hasPermission(PERMISSIONS.ACTION_PRODUCTION_BATCHES_ISSUE),
    accept: hasPermission(PERMISSIONS.ACTION_PRODUCTION_BATCHES_ACCEPT_PRODUCTION),
    cook: hasPermission(PERMISSIONS.ACTION_PRODUCTION_BATCHES_COOK),
    acceptFinished: hasPermission(PERMISSIONS.ACTION_PRODUCTION_BATCHES_ACCEPT_FINISHED),
    revokeAny: hasPermission(PERMISSIONS.ACTION_PRODUCTION_BATCHES_REVOKE_ANY),
  };
  const canCreate = can.create;
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

  const lines = useMemo(() => data?.lines ?? [], [data?.lines]);
  const draft = useIssueDraft(lines);
  const outputDraft = useOutputDraft(data);
  // Факт по рядках: редагування – під час готування, перегляд – після підпису факту виходу
  const outputEditable = can.accept && (data?.status === 'accepted' || data?.status === 'cooking');
  const outputView = data != null && ['output', 'finished', 'closed'].includes(data.status);
  const raw = lines.filter((l) => l.kind === 'raw');
  const packaging = lines.filter((l) => l.kind === 'packaging');
  const linesMode: BatchLinesMode = !data
    ? 'plan'
    : data.status === 'draft'
      ? can.issue
        ? 'issue'
        : 'plan'
      : data.status === 'cancelled'
        ? lines.some((l) => l.issuedQty != null)
          ? 'issued'
          : 'plan'
        : 'issued';
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
        {data && <BatchActButton batch={data} />}
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
                <Stepper batch={data} draft={draft} outputDraft={outputDraft} userId={typeof user?.id === 'number' ? user.id : null} can={can} />
              </CardBody>
            </Card>
            <Card className="rounded-lg shadow-none">
              <CardBody className="flex flex-col gap-5 p-4">
                <Section icon="list" title="Сировина" aside={`на ${data.plannedPortions} порцій`}>
                  {outputEditable || outputView ? (
                    <OutputLinesTable kind="raw" lines={raw} draft={outputEditable ? outputDraft : null} />
                  ) : (
                    <BatchLinesTable kind="raw" lines={raw} mode={linesMode} draft={draft} />
                  )}
                </Section>
                {packaging.length > 0 && (
                  <Section icon="package" title="Пакування" className="pt-3">
                    {outputEditable || outputView ? (
                      <OutputLinesTable kind="packaging" lines={packaging} draft={outputEditable ? outputDraft : null} />
                    ) : (
                      <BatchLinesTable kind="packaging" lines={packaging} mode={linesMode} draft={draft} />
                    )}
                  </Section>
                )}
                {data.stages.length > 0 && (
                  <Section icon="list-ordered" title="Етапи" className="pt-4">
                    <BatchStagesGantt stages={data.stages} />
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
