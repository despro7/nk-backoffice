import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  applyLabelFieldToTemplate,
  ESTIMATED_SIGN_FIELD_NAME,
} from '@shared/pdfme/applyLabelFieldToTemplate';
import type {
  LabelFieldApplyPart,
  LabelPdfmeTemplate,
  LabelTemplateDto,
} from '@shared/types/labelTemplate';
import { labelTemplateDefaultSlots } from '@shared/utils/labelTemplateDefaults';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { pluralize } from '@/lib/formatUtils';
import { LabelTemplateService } from '@/services/LabelTemplateService';
import { ToastService } from '@/services/ToastService';
import { LabelTemplateIcon } from './LabelTemplateIcon';

type PartialPart = Exclude<LabelFieldApplyPart, 'all'>;

const PART_OPTIONS: Array<{ value: PartialPart; label: string }> = [
  { value: 'geometry', label: 'Положення й розмір' },
  { value: 'font', label: 'Шрифт і вирівнювання' },
  { value: 'content', label: 'Вміст (mock)' },
];

const DEFAULT_PARTS: PartialPart[] = ['geometry', 'font'];

function slotKey(row: Pick<LabelTemplateDto, 'audience' | 'labelKind'>): string {
  return `${row.audience}:${row.labelKind}`;
}

function slotLabel(audience: string, labelKind: string): string {
  return `${audience === 'kit' ? 'Комплекти' : 'Продукція'} · ${labelKind === 'portion' ? 'порція' : 'коробка'}`;
}

function templatesWord(count: number): string {
  return pluralize(count, 'шаблон', 'шаблони', 'шаблонів');
}

interface LabelApplyFieldModalProps {
  /** Поле з чернетки Designer; null – модалка закрита. */
  field: Record<string, unknown> | null;
  sourceTemplateId: string | null;
  templates: LabelTemplateDto[];
  onClose: () => void;
  onApplied: () => Promise<unknown>;
}

export function LabelApplyFieldModal({
  field,
  sourceTemplateId,
  templates,
  onClose,
  onApplied,
}: LabelApplyFieldModalProps) {
  const [parts, setParts] = useState<PartialPart[]>(DEFAULT_PARTS);
  const [wholeField, setWholeField] = useState(false);
  const [removeSign, setRemoveSign] = useState(false);
  const [slotFilter, setSlotFilter] = useState<string | null>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  /** Макети цільових шаблонів для попереднього перегляду. */
  const [details, setDetails] = useState<Record<string, LabelPdfmeTemplate>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const isOpen = field != null;
  const fieldName = String(field?.name ?? '');
  const canRemoveSign = fieldName !== ESTIMATED_SIGN_FIELD_NAME;

  useEffect(() => {
    if (!isOpen) return;
    setParts(DEFAULT_PARTS);
    setWholeField(false);
    setRemoveSign(false);
    setSlotFilter(null);
    setTargetIds([]);
    setDetails({});
    setConfirmOpen(false);
  }, [isOpen]);

  const candidates = useMemo(
    () => templates.filter((row) => row.id !== sourceTemplateId && !row.isArchived),
    [templates, sourceTemplateId],
  );
  const visible = slotFilter ? candidates.filter((row) => slotKey(row) === slotFilter) : candidates;
  const selected = candidates.filter((row) => targetIds.includes(row.id));
  const allVisibleSelected = visible.length > 0 && visible.every((row) => targetIds.includes(row.id));

  useEffect(() => {
    if (!isOpen) return;
    const missing = targetIds.filter((id) => !details[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map((id) => LabelTemplateService.get(id)))
      .then((rows) => {
        if (cancelled) return;
        setDetails((prev) => ({
          ...prev,
          ...Object.fromEntries(rows.map((row) => [row.id, row.template])),
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        ToastService.show({
          title: 'Не вдалося завантажити шаблони для перегляду',
          description: err instanceof Error ? err.message : undefined,
          color: 'danger',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, targetIds, details]);

  const effectiveParts: LabelFieldApplyPart[] = wholeField ? ['all'] : parts;
  const removeEstimatedSign = removeSign && canRemoveSign;

  const preview = selected.map((row) => {
    const template = details[row.id];
    if (!field || !template || effectiveParts.length === 0) return { row, result: null, error: null };
    try {
      const result = applyLabelFieldToTemplate(template, field, {
        parts: effectiveParts,
        removeEstimatedSign,
      });
      return { row, result, error: null };
    } catch (err) {
      return { row, result: null, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const canApply =
    effectiveParts.length > 0 && preview.length > 0 && preview.every((item) => item.result != null);

  const handleApply = async () => {
    if (!field || !sourceTemplateId) return;
    setApplying(true);
    try {
      const { updated } = await LabelTemplateService.applyField({
        sourceTemplateId,
        field,
        parts: effectiveParts,
        targetTemplateIds: selected.map((row) => row.id),
        removeEstimatedSign,
      });
      ToastService.show({
        title: `Оновлено ${updated.length} ${templatesWord(updated.length)}`,
        color: 'success',
      });
      setConfirmOpen(false);
      onClose();
      await onApplied();
    } catch (err) {
      setConfirmOpen(false);
      ToastService.show({
        title: 'Не вдалося застосувати поле',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-lg font-semibold">Застосувати поле до інших шаблонів</span>
            <span className="text-xs font-normal text-default-500">
              Поле <span className="font-mono text-default-900">{fieldName}</span> · тип{' '}
              <span className="font-mono">{String(field?.type ?? '')}</span> з поточної чернетки.
              Поточний шаблон не змінюється й не зберігається.
            </span>
          </ModalHeader>
          <ModalBody className="gap-5">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Що копіювати</p>
              <CheckboxGroup
                aria-label="Що копіювати"
                orientation="horizontal"
                size="sm"
                value={wholeField ? PART_OPTIONS.map((o) => o.value) : parts}
                onValueChange={(next) => setParts(next as PartialPart[])}
                isDisabled={wholeField}
              >
                {PART_OPTIONS.map((option) => (
                  <Checkbox key={option.value} value={option.value}>
                    {option.label}
                  </Checkbox>
                ))}
              </CheckboxGroup>
              <Checkbox size="sm" isSelected={wholeField} onValueChange={setWholeField}>
                Усе поле
              </Checkbox>
              <p className="text-xs text-default-500">
                Якщо в шаблоні такого поля немає, воно додається повністю на першу сторінку.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Куди застосувати</p>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: null, label: 'Усі' },
                  ...labelTemplateDefaultSlots().map(({ audience, labelKind }) => ({
                    key: `${audience}:${labelKind}`,
                    label: slotLabel(audience, labelKind),
                  })),
                ].map(({ key, label }) => (
                  <Chip
                    key={key ?? 'all'}
                    as="button"
                    type="button"
                    size="sm"
                    variant={slotFilter === key ? 'solid' : 'flat'}
                    color={slotFilter === key ? 'primary' : 'default'}
                    className="cursor-pointer"
                    aria-pressed={slotFilter === key}
                    onClick={() => setSlotFilter(key)}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
              <Checkbox
                size="sm"
                isSelected={allVisibleSelected}
                isDisabled={visible.length === 0}
                onValueChange={(on) => {
                  const ids = visible.map((row) => row.id);
                  setTargetIds((prev) =>
                    on ? [...new Set([...prev, ...ids])] : prev.filter((id) => !ids.includes(id)),
                  );
                }}
              >
                Обрати всі
              </Checkbox>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-default-200 p-3">
                {visible.length === 0 ? (
                  <p className="text-xs text-default-500">Немає шаблонів.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {visible.map((row) => (
                      <Checkbox
                        key={row.id}
                        size="sm"
                        isSelected={targetIds.includes(row.id)}
                        onValueChange={(on) =>
                          setTargetIds((prev) =>
                            on ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                          )
                        }
                      >
                        <span className="flex items-center gap-2">
                          <LabelTemplateIcon iconKey={row.iconKey} size={14} className="text-default-500" />
                          {row.name}
                          <span className="text-xs text-default-400">
                            {slotLabel(row.audience, row.labelKind)}
                          </span>
                        </span>
                      </Checkbox>
                    ))}
                  </div>
                )}
              </div>
              {canRemoveSign ? (
                <Checkbox size="sm" isSelected={removeSign} onValueChange={setRemoveSign}>
                  Видалити поле {ESTIMATED_SIGN_FIELD_NAME} (знак ℮) у цих шаблонах
                </Checkbox>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Попередній перегляд ({preview.length})</p>
              {preview.length === 0 ? (
                <p className="text-xs text-default-500">Оберіть шаблони.</p>
              ) : (
                <ul className="divide-y divide-default-100 rounded-lg border border-default-200">
                  {preview.map(({ row, result, error }) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                      <span className="min-w-0 flex-1">{row.name}</span>
                      {error ? <span className="text-xs text-danger">{error}</span> : null}
                      {result ? (
                        <>
                          <Chip
                            size="sm"
                            variant="flat"
                            color={result.action === 'added' ? 'success' : 'primary'}
                          >
                            {result.action === 'added' ? 'додано' : 'замінено'}
                          </Chip>
                          {result.removedEstimatedSign ? (
                            <Chip size="sm" variant="flat" color="warning">видалено ℮</Chip>
                          ) : null}
                        </>
                      ) : null}
                      {!result && !error && effectiveParts.length > 0 ? (
                        <DynamicIcon name="loader-2" size={14} className="animate-spin text-default-400" />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>
              Скасувати
            </Button>
            <Button color="primary" isDisabled={!canApply} onPress={() => setConfirmOpen(true)}>
              Застосувати
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={isOpen && confirmOpen}
        title="Застосувати поле?"
        message={`Буде змінено ${selected.length} ${templatesWord(selected.length)}. Поле «${fieldName}» запишеться в них одразу.`}
        confirmText="Застосувати"
        cancelText="Скасувати"
        confirmColor="primary"
        confirmLoading={applying}
        onConfirm={() => void handleApply()}
        onCancel={() => {
          if (!applying) setConfirmOpen(false);
        }}
      />
    </>
  );
}
