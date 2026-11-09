import { useEffect, useState } from 'react';
import { Button, Input, Textarea, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { BaseModal } from '@/components/modals/BaseModal';
import { cn } from '@/lib/utils';
import { ToastService } from '@/services/ToastService';
import type {
  ProductionBatchDetailDto,
  ProductionBatchSignatureDto,
  ProductionBatchStageDto,
} from '@shared/types/production';
import { isIssueShortage, issuePlan, stockShortGoodIds } from '@shared/utils/productionBatchIssue';
import { useProductionBatchActions } from '../useProductionBatches';
import { formatQty } from './batchUi';
import { BatchDateTimePicker } from './BatchDatePicker';
import type { IssueDraft } from './BatchLinesTable';
import { formatMinutes } from './techCardRecipe';
import { formatDateTime } from './techCardUi';

type BatchActions = ReturnType<typeof useProductionBatchActions>;

/** Виконати дію з тостом помилки; true – успіх. */
export async function run(action: () => Promise<unknown>, success?: string, failure = 'Не вдалося виконати дію'): Promise<boolean> {
  try {
    await action();
    if (success) ToastService.show({ title: success, color: 'success' });
    return true;
  } catch (err) {
    ToastService.show({ title: failure, description: err instanceof Error ? err.message : undefined, color: 'danger' });
    return false;
  }
}

export function BusyIcon({ busy, icon }: { busy: boolean; icon: string }) {
  return <DynamicIcon name={(busy ? 'loader-2' : icon) as never} size={14} className={busy ? 'animate-spin' : ''} />;
}

function formatClock(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

// ── Підпис ───────────────────────────────────────────────────────────────────

interface SignatureLineProps {
  batch: ProductionBatchDetailDto;
  signature: ProductionBatchSignatureDto;
  canRevoke: boolean;
}

/** «Підписав …» під пройденим кроком; відкликати – поки варка на цьому кроці. */
export function SignatureLine({ batch, signature, canRevoke }: SignatureLineProps) {
  const actions = useProductionBatchActions();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    if (!comment.trim()) {
      ToastService.show({ title: 'Вкажіть причину', color: 'warning' });
      return;
    }
    setBusy(true);
    const ok = await run(
      () => actions.revokeSignature(batch.id, signature.id, comment),
      'Підпис відкликано',
      'Не вдалося відкликати підпис',
    );
    setBusy(false);
    if (ok) {
      setOpen(false);
      setComment('');
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-default-600">
      <DynamicIcon name="signature" size={14} className="text-success-600" />
      <span>
        {signature.userName}
        {signature.roleLabel ? <span className="text-default-400"> · {signature.roleLabel}</span> : null}
        <span className="text-default-400"> · {formatDateTime(signature.signedAt)}</span>
      </span>
      {canRevoke && (
        <Button size="sm" variant="light" className="h-6 min-w-0 px-2 text-xs text-default-500" onPress={() => setOpen(true)}>
          Відкликати
        </Button>
      )}
      <BaseModal
        isOpen={open}
        title="Відкликати підпис"
        message={
          <div className="flex flex-col gap-3">
            <p className="text-sm text-default-600">Варка повернеться на попередній крок. Причина потрапить у таймлайн.</p>
            <Textarea autoFocus label="Причина" minRows={2} value={comment} onValueChange={setComment} />
          </div>
        }
        confirmText="Відкликати"
        confirmColor="danger"
        cancelText="Не відкликати"
        confirmLoading={busy}
        onConfirm={() => void revoke()}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

// ── Крок 2: видача сировини ──────────────────────────────────────────────────

/** Дії комірника: оновити залишки, зберегти чернетку, підтвердити видачу (підпис). */
export function IssueStepPanel({ batch, draft }: { batch: ProductionBatchDetailDto; draft: IssueDraft }) {
  const actions = useProductionBatchActions();
  const [busy, setBusy] = useState<'refresh' | 'save' | 'sign' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const snapAt = batch.lines.map((l) => l.stockSnapAt).find(Boolean) ?? null;
  const filled = batch.lines.filter((l) => draft.issued(l.id) != null).length;
  const shortages = batch.lines.filter((l) => isIssueShortage(l, draft.issued(l.id)));
  const missingComment = shortages.filter((l) => !draft.rows[l.id]?.shortageComment.trim());
  const stockShort = stockShortGoodIds(batch.lines).size;

  const exec = async (kind: 'refresh' | 'save' | 'sign', action: () => Promise<unknown>, success: string, failure: string) => {
    setBusy(kind);
    const ok = await run(action, success, failure);
    setBusy(null);
    return ok;
  };

  // Спершу зберегти введене: відповідь сервера перезаписує чернетку
  const refresh = () =>
    void exec(
      'refresh',
      async () => {
        if (draft.dirty) await actions.saveIssue(batch.id, draft.toInput());
        await actions.refreshStock(batch.id);
      },
      'Залишки оновлено з Dilovod',
      'Не вдалося оновити залишки',
    );

  const sign = async () => {
    const ok = await exec('sign', () => actions.signIssue(batch.id, draft.toInput()), 'Видачу підтверджено', 'Не вдалося підтвердити видачу');
    if (ok) setConfirmOpen(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-500">
        <span className="inline-flex items-center gap-1.5">
          <DynamicIcon name="warehouse" size={14} />
          {snapAt ? `Облікові залишки на ${formatDateTime(snapAt)}` : 'Облікові залишки ще не завантажено'}
        </span>
        <span className="tabular-nums">
          Заповнено {filled} з {batch.lines.length}
        </span>
        {stockShort > 0 && (
          <span className="inline-flex items-center gap-1 text-warning-600">
            <DynamicIcon name="triangle-alert" size={13} />
            Облікового залишку не вистачає: {stockShort}
          </span>
        )}
        {shortages.length > 0 && (
          <span className="inline-flex items-center gap-1 text-warning-600">
            <DynamicIcon name="circle-alert" size={13} />
            Видано менше плану: {shortages.length}
          </span>
        )}
      </div>
      <p className="text-xs text-default-500">
        Заповніть «Видано» в таблиці сировини і пакування нижче. Якщо видано менше плану, поясніть нестачу.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="flat"
          isDisabled={busy != null}
          startContent={<BusyIcon busy={busy === 'refresh'} icon="refresh-cw" />}
          onPress={refresh}
        >
          Оновити залишки
        </Button>
        <Button
          variant="flat"
          isDisabled={busy != null || filled === batch.lines.length}
          startContent={<DynamicIcon name="list-checks" size={14} />}
          onPress={draft.fillFromPlan}
        >
          Видано = план
        </Button>
        {draft.dirty && (
          <Button
            variant="flat"
            isDisabled={busy != null}
            startContent={<BusyIcon busy={busy === 'save'} icon="save" />}
            onPress={() =>
              void exec('save', () => actions.saveIssue(batch.id, draft.toInput()), 'Чернетку видачі збережено', 'Не вдалося зберегти')
            }
          >
            Зберегти чернетку
          </Button>
        )}
        <Button
          color="primary"
          isDisabled={busy != null}
          startContent={<DynamicIcon name="signature" size={14} />}
          onPress={() => setConfirmOpen(true)}
        >
          Підтвердити видачу
        </Button>
      </div>

      <BaseModal
        isOpen={confirmOpen}
        title="Підтвердити видачу"
        message={
          <div className="flex flex-col gap-2 text-sm text-default-700">
            {filled < batch.lines.length ? (
              <p className="text-danger-600">
                Не заповнено «Видано»: {batch.lines.length - filled} поз. Заповніть усі рядки (можна «Видано = план»).
              </p>
            ) : missingComment.length > 0 ? (
              <p className="text-danger-600">
                Поясніть нестачу: {missingComment.map((l) => l.name).join(', ')}.
              </p>
            ) : (
              <>
                <p>
                  Ваш підпис підтвердить видачу {batch.lines.length} поз. на варку {batch.number}. Після цього варку приймає
                  виробництво.
                </p>
                {shortages.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-xs text-warning-700">
                    {shortages.map((l) => {
                      const plan = issuePlan(l);
                      return (
                        <li key={l.id}>
                          {l.name}: {formatQty(draft.issued(l.id))} з {formatQty(plan.qty)} {plan.unit}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        }
        confirmText={filled < batch.lines.length || missingComment.length > 0 ? 'Зрозуміло' : 'Підписати'}
        cancelText="Назад"
        confirmLoading={busy === 'sign'}
        onConfirm={() => {
          if (filled < batch.lines.length || missingComment.length > 0) setConfirmOpen(false);
          else void sign();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── Крок 3: прийом на виробництво ────────────────────────────────────────────

export function AcceptStepPanel({ batch }: { batch: ProductionBatchDetailDto }) {
  const actions = useProductionBatchActions();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const shortages = batch.lines.filter((l) => isIssueShortage(l, l.issuedQty));

  const accept = async () => {
    setBusy(true);
    await run(() => actions.acceptProduction(batch.id, comment), 'Прийнято на виробництво', 'Не вдалося прийняти');
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-default-500">
        Перевірте видану сировину і пакування в таблиці нижче. Підпис підтверджує, що виробництво прийняло видане.
      </p>
      {shortages.length > 0 && (
        <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
          <p className="mb-1 font-semibold">Видано менше плану</p>
          <ul className="flex flex-col gap-0.5">
            {shortages.map((l) => {
              const plan = issuePlan(l);
              return (
                <li key={l.id}>
                  {l.name}: {formatQty(l.issuedQty)} з {formatQty(plan.qty)} {plan.unit}
                  {l.shortageComment ? ` – ${l.shortageComment}` : ''}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Textarea label="Коментар" minRows={1} value={comment} onValueChange={setComment} className="md:max-w-xl" />
      <div className="flex">
        <Button
          color="primary"
          isDisabled={busy}
          startContent={<BusyIcon busy={busy} icon="signature" />}
          onPress={() => void accept()}
        >
          Прийняти на виробництво
        </Button>
      </div>
    </div>
  );
}

// ── Крок 4: готування ────────────────────────────────────────────────────────

function StageRow({
  batch,
  stage,
  index,
  canCook,
  actions,
}: {
  batch: ProductionBatchDetailDto;
  stage: ProductionBatchStageDto;
  index: number;
  canCook: boolean;
  actions: BatchActions;
}) {
  const [temp, setTemp] = useState(stage.actualTemp ?? '');
  const [comment, setComment] = useState(stage.comment ?? '');
  const [busy, setBusy] = useState<'start' | 'finish' | 'undo' | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const running = stage.startedAt != null && stage.finishedAt == null;
  const done = stage.finishedAt != null;
  const factMin =
    stage.startedAt && stage.finishedAt
      ? Math.max(1, Math.round((new Date(stage.finishedAt).getTime() - new Date(stage.startedAt).getTime()) / 60000))
      : null;

  const exec = async (kind: 'start' | 'finish' | 'undo', action: () => Promise<unknown>, failure: string) => {
    setBusy(kind);
    await run(action, undefined, failure);
    setBusy(null);
  };

  return (
    <li className="flex flex-col gap-2 border-t border-default-200/70 py-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
            done && 'bg-primary text-primary-foreground',
            running && 'border border-primary text-primary ring-2 ring-primary/15',
            !stage.startedAt && 'border border-default-300 text-default-500',
          )}
        >
          {done ? <DynamicIcon name="check" size={12} /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-default-900">{stage.name}</p>
          <p className="text-xs text-default-500 tabular-nums">
            {[
              stage.plannedOffsetMin ? `план +${formatMinutes(stage.plannedOffsetMin)}` : 'план від старту',
              stage.plannedDurationMin ? formatMinutes(stage.plannedDurationMin) : null,
              stage.startedAt ? `старт ${formatClock(stage.startedAt)}${stage.startedByName ? ` (${stage.startedByName})` : ''}` : null,
              stage.finishedAt ? `фініш ${formatClock(stage.finishedAt)}` : null,
              factMin != null ? `факт ${formatMinutes(factMin)}` : null,
              done && stage.actualTemp ? `t ${stage.actualTemp}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {done && stage.comment && <p className="text-xs text-default-600">{stage.comment}</p>}
        </div>
        {canCook && (
          <div className="flex items-center gap-1.5">
            {!stage.startedAt && (
              <Button
                size="sm"
                color="primary"
                variant="flat"
                isDisabled={busy != null}
                startContent={<BusyIcon busy={busy === 'start'} icon="play" />}
                onPress={() => void exec('start', () => actions.startStage(batch.id, stage.id), 'Не вдалося розпочати етап')}
              >
                Старт
              </Button>
            )}
            <Tooltip content="Вказати фактичний час" classNames={{ content: 'text-xs' }} delay={250} closeDelay={0}>
              <Button
                size="sm"
                variant="light"
                isIconOnly
                aria-label="Вказати фактичний час"
                isDisabled={busy != null}
                onPress={() => setTimeOpen(true)}
              >
                <DynamicIcon name="clock" size={14} />
              </Button>
            </Tooltip>
            {stage.startedAt && batch.status === 'cooking' && (
              <Tooltip
                content={done ? 'Відмінити фініш' : 'Відмінити старт'}
                classNames={{ content: 'text-xs' }}
                delay={250}
                closeDelay={0}
              >
                <Button
                  size="sm"
                  variant="light"
                  isIconOnly
                  aria-label={done ? 'Відмінити фініш' : 'Відмінити старт'}
                  isDisabled={busy != null}
                  onPress={() => void exec('undo', () => actions.undoStage(batch.id, stage.id), 'Не вдалося відмінити')}
                >
                  <BusyIcon busy={busy === 'undo'} icon="undo-2" />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      {running && canCook && (
        <div className="flex flex-wrap items-end gap-2 pl-8">
          <Input
            size="sm"
            label="Температура"
            placeholder="напр. 92 °C"
            className="w-36"
            value={temp}
            onValueChange={setTemp}
          />
          <Input size="sm" label="Коментар" className="min-w-48 flex-1" value={comment} onValueChange={setComment} />
          <Button
            color="primary"
            isDisabled={busy != null}
            startContent={<BusyIcon busy={busy === 'finish'} icon="square" />}
            onPress={() =>
              void exec(
                'finish',
                () => actions.finishStage(batch.id, stage.id, { actualTemp: temp, comment }),
                'Не вдалося завершити етап',
              )
            }
          >
            Фініш
          </Button>
        </div>
      )}
      <StageTimeModal
        isOpen={timeOpen}
        batch={batch}
        stage={stage}
        actions={actions}
        onClose={() => setTimeOpen(false)}
      />
    </li>
  );
}

/** Фактичний час етапу вручну: коли варку оформлюють не в момент готування. */
function StageTimeModal({
  isOpen,
  batch,
  stage,
  actions,
  onClose,
}: {
  isOpen: boolean;
  batch: ProductionBatchDetailDto;
  stage: ProductionBatchStageDto;
  actions: BatchActions;
  onClose: () => void;
}) {
  const [start, setStart] = useState('');
  const [finish, setFinish] = useState('');
  const [temp, setTemp] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStart(stage.startedAt ?? '');
    setFinish(stage.finishedAt ?? '');
    setTemp(stage.actualTemp ?? '');
    setComment(stage.comment ?? '');
  }, [isOpen, stage.startedAt, stage.finishedAt, stage.actualTemp, stage.comment]);

  const finishBeforeStart = Boolean(start && finish && new Date(finish) < new Date(start));

  const save = async () => {
    if (!start) {
      ToastService.show({ title: 'Вкажіть початок етапу', color: 'warning' });
      return;
    }
    if (finishBeforeStart) return;
    setBusy(true);
    const ok = await run(
      () =>
        actions.updateStage(batch.id, stage.id, {
          startedAt: start,
          finishedAt: finish || null,
          actualTemp: temp,
          comment,
        }),
      'Час етапу збережено',
      'Не вдалося зберегти час етапу',
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      title={`Фактичний час: ${stage.name}`}
      message={
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BatchDateTimePicker label="Початок" value={start} onChange={setStart} isRequired />
            <BatchDateTimePicker
              label="Завершення"
              value={finish}
              onChange={setFinish}
              isInvalid={finishBeforeStart}
              errorMessage="Раніше за початок"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
            <Input label="Температура" placeholder="напр. 92 °C" value={temp} onValueChange={setTemp} />
            <Input label="Коментар" value={comment} onValueChange={setComment} />
          </div>
          <p className="text-xs text-default-500">
            Для оформлення заднім числом. Без завершення етап лишається в процесі. Зміну часу видно в таймлайні.
          </p>
        </div>
      }
      confirmText="Зберегти"
      cancelText="Скасувати"
      confirmLoading={busy}
      onConfirm={() => void save()}
      onCancel={onClose}
    />
  );
}

/** Старт / фініш етапів, фактична температура і коментар; хто і коли – з відміток. */
export function CookingStepPanel({ batch, canCook }: { batch: ProductionBatchDetailDto; canCook: boolean }) {
  const actions = useProductionBatchActions();
  if (batch.stages.length === 0) {
    return <p className="text-xs text-default-500">У техкарті немає етапів.</p>;
  }
  const finished = batch.stages.filter((s) => s.finishedAt).length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-default-500 tabular-nums">
        Завершено {finished} з {batch.stages.length}
        {finished === batch.stages.length ? ' · далі – факт виходу' : ''}
      </p>
      <ol className="flex flex-col">
        {batch.stages.map((stage, idx) => (
          <StageRow key={stage.id} batch={batch} stage={stage} index={idx} canCook={canCook} actions={actions} />
        ))}
      </ol>
    </div>
  );
}
