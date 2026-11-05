import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Textarea,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { BaseModal } from '@/components/modals/BaseModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { ToastService } from '@/services/ToastService';
import { pluralize } from '@/lib/formatUtils';
import { getSpecColorByHue, specColorToClassNames } from '@shared/utils/specColorPalette';
import {
  CATALOG_SPEC_ERROR_CODES,
  CATALOG_SPEC_VERSION_SOURCE_LABELS,
  type CatalogSpecContentDetail,
  type CatalogSpecDraftDto,
  type CatalogSpecStateDto,
  type CatalogSpecVersionDto,
} from '@shared/types/catalogSpec';
import { diffSpecContent, specContentFromDetail } from '@shared/utils/catalogSpecContent';
import { buildCatalogAuditLines, type CatalogAuditDictionaries } from '@shared/utils/catalogGoodAuditFormat';
import { CatalogApiError, catalogApi } from '../../catalogApi';
import { CatalogAuditLineList } from '../audit/CatalogAuditEntry';

const MODAL_CLASSES = {
  base: 'max-w-lg rounded-xl shadow-lg',
  header: 'pl-4 pb-2 pr-8',
  body: 'px-4 py-2',
  footer: 'px-4 justify-start gap-3',
  closeButton: 'absolute right-3 top-3',
};

type WidgetTone = 'neutral' | 'pending' | 'rejected';

const TONE: Record<WidgetTone, { hue: string; icon: 'file-check-2' | 'file-clock' | 'file-x' }> = {
  neutral: { hue: 'slate', icon: 'file-check-2' },
  pending: { hue: 'amber', icon: 'file-clock' },
  rejected: { hue: 'rose', icon: 'file-x' },
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function contentSummary(content: CatalogSpecContentDetail): string {
  const n = content.components.length;
  const parts = [`${n} ${pluralize(n, 'компонент', 'компоненти', 'компонентів')}`];
  if (content.specQty != null) parts.push(`на ${content.specQty} шт.`);
  return parts.join(' · ');
}

interface Props {
  goodId: string;
  state: CatalogSpecStateDto | null;
  /** Чинна (затверджена) специфікація з картки. */
  approved: CatalogSpecContentDetail;
  canEditSpec: boolean;
  canApprove: boolean;
  currentUserId: number | null;
  /** Чернетку завантажено в редактор BOM. */
  draftLoaded: boolean;
  /** Незбережені зміни картки блокують дії, що перезавантажують специфікацію. */
  isDirty: boolean;
  dictionaries?: CatalogAuditDictionaries;
  overlayZ?: string;
  onStateChange: (state: CatalogSpecStateDto) => void;
  onLoadDraft: (draft: CatalogSpecDraftDto) => void;
  /** Специфікацію застосовано (затвердження / відкат): перезавантажити картку. */
  onSpecApplied: () => void;
}

/**
 * Віджет версії специфікації в заголовку BOM: компактний чип із версією і статусом чернетки,
 * по кліку поповер з деталями та діями (порівняти, затвердити, історія версій).
 */
export function SpecModerationPanel({
  goodId,
  state,
  approved,
  canEditSpec,
  canApprove,
  currentUserId,
  draftLoaded,
  isDirty,
  dictionaries,
  overlayZ,
  onStateChange,
  onLoadDraft,
  onSpecApplied,
}: Props) {
  const draft = state?.draft ?? null;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [staleConfirmOpen, setStaleConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<CatalogSpecVersionDto[] | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [restoreComment, setRestoreComment] = useState('');

  const approvedContent = useMemo(() => specContentFromDetail(approved), [approved]);
  const draftLines = useMemo(() => {
    if (!draft) return [];
    return buildCatalogAuditLines(diffSpecContent(goodId, approvedContent, specContentFromDetail(draft)), dictionaries);
  }, [draft, approvedContent, goodId, dictionaries]);

  const canDiscard = Boolean(draft) && (canApprove || (canEditSpec && draft?.authorId === currentUserId));
  const rejected = draft?.status === 'rejected';

  const guardDirty = useCallback((): boolean => {
    if (!isDirty) return true;
    ToastService.show({
      title: 'Є незбережені зміни',
      description: 'Збережіть або скасуйте зміни картки, перш ніж змінювати специфікацію.',
      color: 'warning',
    });
    return false;
  }, [isDirty]);

  const run = useCallback(
    async (key: string, fn: () => Promise<CatalogSpecStateDto>, success?: string, applied = false) => {
      setBusy(key);
      try {
        const next = await fn();
        onStateChange(next);
        if (success) ToastService.show({ title: success, color: 'success' });
        if (applied) onSpecApplied();
        return true;
      } catch (error) {
        if (error instanceof CatalogApiError && error.code === CATALOG_SPEC_ERROR_CODES.DRAFT_STALE) {
          setStaleConfirmOpen(true);
          return false;
        }
        ToastService.show({ title: 'Помилка', description: errorMessage(error), color: 'danger' });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [onStateChange, onSpecApplied],
  );

  const approve = useCallback(
    async (force = false) => {
      if (!guardDirty()) return;
      const ok = await run('approve', () => catalogApi.approveSpecDraft(goodId, force), 'Специфікацію затверджено', true);
      if (ok) {
        setCompareOpen(false);
        setStaleConfirmOpen(false);
        setPopoverOpen(false);
        setVersions(null);
      }
    },
    [goodId, guardDirty, run],
  );

  const reject = useCallback(async () => {
    const ok = await run('reject', () => catalogApi.rejectSpecDraft(goodId, rejectReason), 'Чернетку відхилено');
    if (ok) {
      setRejectOpen(false);
      setCompareOpen(false);
      setRejectReason('');
    }
  }, [goodId, rejectReason, run]);

  const discard = useCallback(async () => {
    const ok = await run('discard', () => catalogApi.discardSpecDraft(goodId), 'Чернетку видалено');
    if (ok) setDiscardConfirmOpen(false);
  }, [goodId, run]);

  const loadVersions = useCallback(async () => {
    try {
      const rows = await catalogApi.fetchSpecVersions(goodId);
      setVersions(rows);
      // Перший перегляд створює v1: оновлюємо стан віджета.
      const latest = rows.reduce((max, v) => Math.max(max, v.version), 0);
      if (state && latest > (state.currentVersion ?? 0)) {
        void catalogApi.fetchSpecState(goodId).then(onStateChange).catch(() => undefined);
      }
    } catch (error) {
      ToastService.show({ title: 'Помилка', description: errorMessage(error), color: 'danger' });
      setVersions([]);
    }
  }, [goodId, state, onStateChange]);

  useEffect(() => {
    if (versionsOpen && versions === null) void loadVersions();
  }, [versionsOpen, versions, loadVersions]);

  useEffect(() => {
    setVersions(null);
    setExpandedVersion(null);
  }, [goodId]);

  const currentVersion = Math.max(state?.currentVersion ?? 0, ...(versions ?? []).map((v) => v.version)) || null;

  const restore = useCallback(async () => {
    if (restoreTarget == null || !guardDirty()) return;
    const ok = await run(
      'restore',
      () => catalogApi.restoreSpecVersion(goodId, restoreTarget, restoreComment),
      canApprove ? `Відновлено версію ${restoreTarget}` : 'Відкат надіслано на затвердження',
      canApprove,
    );
    if (ok) {
      setRestoreTarget(null);
      setRestoreComment('');
      setVersionsOpen(false);
      setVersions(null);
    }
  }, [restoreTarget, guardDirty, run, goodId, restoreComment, canApprove]);

  if (!state) return null;

  const tone: WidgetTone = draft ? (rejected ? 'rejected' : 'pending') : 'neutral';
  const toneCfg = TONE[tone];
  const statusLabel = draftLoaded ? 'чернетка в редакторі' : draft ? (rejected ? 'відхилено' : 'на затвердженні') : null;
  const current = state.current;

  const openVersions = () => {
    setPopoverOpen(false);
    setVersionsOpen(true);
  };

  return (
    <>
      <Popover placement="bottom-start" isOpen={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger>
          <button
            type="button"
            aria-label="Версія специфікації"
            className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-opacity hover:opacity-80 ${specColorToClassNames(
              getSpecColorByHue(toneCfg.hue),
              { border: true },
            )}`}
          >
            <DynamicIcon name={toneCfg.icon} size={13} className="shrink-0" />
            <span>{state.currentVersion != null ? `v${state.currentVersion}` : 'v–'}</span>
            {statusLabel ? <span className="font-normal">· {statusLabel}</span> : null}
            <DynamicIcon name="chevron-down" size={12} className="shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0">
          <div className="w-full">
            <div className="px-3 py-2.5">
              <p className="text-sm font-semibold text-default-800">
                {current ? `Чинна специфікація, версія ${current.version}` : 'Специфікація ще без версій'}
              </p>
              <p className="mt-0.5 text-xs text-default-500">
                {current
                  ? [
                      formatDateTime(current.at),
                      current.byName,
                      current.source !== 'ui' ? CATALOG_SPEC_VERSION_SOURCE_LABELS[current.source] : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Перша версія зʼявиться після першої зміни.'}
              </p>
            </div>

            {draft ? (
              <>
                <Divider />
                <div className="space-y-1.5 px-3 py-2.5">
                  <p className={`text-sm font-semibold ${rejected ? 'text-rose-600' : 'text-amber-600'}`}>
                    {rejected
                      ? 'Чернетку відхилено'
                      : draft.restoredFromVersion != null
                        ? `Відкат до версії ${draft.restoredFromVersion} на затвердженні`
                        : 'Зміни на затвердженні'}
                  </p>
                  <p className="text-xs text-default-500">
                    {[draft.authorName ?? 'Невідомий автор', formatDateTime(draft.updatedAt)].join(' · ')}
                    {draft.lastEditedByName && draft.lastEditedById !== draft.authorId
                      ? ` · ред. ${draft.lastEditedByName}`
                      : ''}
                  </p>
                  <p className="text-sm text-default-700">{draft.comment}</p>
                  {rejected && draft.rejectReason ? (
                    <p className="text-xs text-rose-600">
                      Причина{draft.reviewedByName ? ` (${draft.reviewedByName})` : ''}: {draft.rejectReason}
                    </p>
                  ) : null}
                  {draft.stale ? (
                    <p className="flex items-start gap-1 text-xs text-warning-700">
                      <DynamicIcon name="triangle-alert" size={12} className="mt-px shrink-0" />
                      Чинну специфікацію змінено після створення чернетки.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="flat"
                      className="h-7"
                      startContent={<DynamicIcon name="git-compare" size={13} />}
                      onPress={() => {
                        setPopoverOpen(false);
                        setCompareOpen(true);
                      }}
                    >
                      Порівняти
                    </Button>
                    {canEditSpec && !draftLoaded ? (
                      <Button
                        size="sm"
                        variant="flat"
                        className="h-7"
                        startContent={<DynamicIcon name="pencil" size={13} />}
                        onPress={() => {
                          if (!guardDirty()) return;
                          setPopoverOpen(false);
                          onLoadDraft(draft);
                        }}
                      >
                        Редагувати
                      </Button>
                    ) : null}
                    {canApprove && !rejected ? (
                      <>
                        <Button
                          size="sm"
                          color="success"
                          className="h-7 text-white"
                          isDisabled={busy != null}
                          startContent={
                            <DynamicIcon
                              name={busy === 'approve' ? 'loader-2' : 'check'}
                              size={13}
                              className={busy === 'approve' ? 'animate-spin' : ''}
                            />
                          }
                          onPress={() => void approve()}
                        >
                          Затвердити
                        </Button>
                        <Button
                          size="sm"
                          color="danger"
                          variant="flat"
                          className="h-7"
                          isDisabled={busy != null}
                          onPress={() => {
                            setPopoverOpen(false);
                            setRejectOpen(true);
                          }}
                        >
                          Відхилити
                        </Button>
                      </>
                    ) : null}
                    {canDiscard ? (
                      <Tooltip content="Видалити чернетку" placement="top" delay={300}>
                        <Button
                          size="sm"
                          variant="light"
                          isIconOnly
                          className="h-7 w-7 min-w-7 text-default-500"
                          aria-label="Видалити чернетку"
                          isDisabled={busy != null}
                          onPress={() => {
                            setPopoverOpen(false);
                            setDiscardConfirmOpen(true);
                          }}
                        >
                          <DynamicIcon name="trash-2" size={14} />
                        </Button>
                      </Tooltip>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            <Divider />
            <Button
              variant="light"
              radius="none"
              fullWidth
              className="h-10 justify-start gap-1.5 rounded-b-lg px-3 text-sm font-medium text-default-700"
              startContent={<DynamicIcon name="history" size={14} />}
              endContent={<DynamicIcon name="chevron-right" size={14} className="ml-auto text-default-400" />}
              onPress={openVersions}
            >
              Історія версій
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Порівняння чернетки з чинною */}
      <Modal
        isOpen={compareOpen}
        onClose={() => setCompareOpen(false)}
        scrollBehavior="inside"
        classNames={{ ...MODAL_CLASSES, wrapper: overlayZ, backdrop: overlayZ }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
            <DynamicIcon name="git-compare" size={18} />
            Зміни відносно версії {state.currentVersion ?? '–'}
          </ModalHeader>
          <ModalBody className="text-sm">
            {draft ? (
              <>
                <p className="text-[11px] text-default-500">
                  {[draft.authorName ?? 'Невідомий автор', formatDateTime(draft.updatedAt)].join(' · ')}
                </p>
                <p className="text-xs text-default-800">{draft.comment}</p>
                {draftLines.length > 0 ? (
                  <div className="rounded-md border border-default-200 bg-default-50 p-2.5 text-xs">
                    <CatalogAuditLineList lines={draftLines} />
                  </div>
                ) : (
                  <p className="text-xs text-default-500">Відмінностей немає.</p>
                )}
              </>
            ) : null}
          </ModalBody>
          <ModalFooter>
            {canApprove && draft && !rejected ? (
              <>
                <Button
                  color="success"
                  className="text-white"
                  isDisabled={busy != null}
                  startContent={
                    <DynamicIcon
                      name={busy === 'approve' ? 'loader-2' : 'check'}
                      size={16}
                      className={busy === 'approve' ? 'animate-spin' : ''}
                    />
                  }
                  onPress={() => void approve()}
                >
                  Затвердити
                </Button>
                <Button color="danger" variant="flat" isDisabled={busy != null} onPress={() => setRejectOpen(true)}>
                  Відхилити
                </Button>
              </>
            ) : null}
            <Button variant="flat" onPress={() => setCompareOpen(false)}>
              Закрити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Історія версій */}
      <Modal
        isOpen={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        scrollBehavior="inside"
        classNames={{ ...MODAL_CLASSES, wrapper: overlayZ, backdrop: overlayZ }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
            <DynamicIcon name="history" size={18} />
            Історія версій
          </ModalHeader>
          <ModalBody>
            {versions === null ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : versions.length === 0 ? (
              <p className="py-2 text-base text-default-500">Версій ще немає.</p>
            ) : (
              <ul className="divide-y divide-default-100">
                {versions.map((v) => {
                  const isCurrent = v.version === currentVersion;
                  const expanded = expandedVersion === v.version;
                  const lines = expanded
                    ? buildCatalogAuditLines(diffSpecContent(goodId, approvedContent, specContentFromDetail(v)), dictionaries)
                    : [];
                  const people = [
                    v.authorName,
                    v.approvedByName && v.approvedByName !== v.authorName ? `затв. ${v.approvedByName}` : null,
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <li key={v.version} className="flex gap-3 py-3">
                      <span
                        className={`h-6 shrink-0 rounded-md px-2 font-mono text-sm font-semibold leading-6 ${
                          isCurrent ? 'bg-emerald-100 text-emerald-700' : 'bg-default-100 text-default-600'
                        }`}
                      >
                        v{v.version}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-6 text-default-500">
                          {[
                            formatDateTime(v.approvedAt ?? v.createdAt),
                            CATALOG_SPEC_VERSION_SOURCE_LABELS[v.source],
                            people || null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          {isCurrent ? <span className="font-medium text-emerald-600"> · чинна</span> : null}
                        </p>
                        {v.comment ? <p className="mt-0.5 text-base text-default-800">{v.comment}</p> : null}
                        <p className="text-xs text-default-400">{contentSummary(v)}</p>
                        {expanded ? (
                          <div className="mt-2 rounded-md border border-default-200 bg-default-50 p-2.5 text-sm">
                            <p className="mb-1 text-sm text-default-500">Що зміниться при відновленні:</p>
                            {lines.length > 0 ? <CatalogAuditLineList lines={lines} /> : <p>Відмінностей немає.</p>}
                          </div>
                        ) : null}
                      </div>
                      {!isCurrent ? (
                        <div className="flex shrink-0 items-start gap-0.5">
                          <Tooltip content={expanded ? 'Сховати відмінності' : 'Відмінності від чинної'} delay={300}>
                            <Button
                              size="sm"
                              variant="light"
                              isIconOnly
                              className={`h-8 w-8 min-w-8 ${expanded ? 'text-default-800' : 'text-default-500'}`}
                              aria-label="Відмінності від чинної"
                              onPress={() => setExpandedVersion(expanded ? null : v.version)}
                            >
                              <DynamicIcon name="git-compare" size={16} />
                            </Button>
                          </Tooltip>
                          {(canEditSpec || canApprove) && !draft ? (
                            <Tooltip content="Відновити цю версію" delay={300}>
                              <Button
                                size="sm"
                                variant="light"
                                isIconOnly
                                className="h-8 w-8 min-w-8 text-default-500"
                                aria-label="Відновити цю версію"
                                onPress={() => {
                                  setRestoreComment('');
                                  setRestoreTarget(v.version);
                                }}
                              >
                                <DynamicIcon name="undo-2" size={16} />
                              </Button>
                            </Tooltip>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setVersionsOpen(false)}>
              Закрити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <BaseModal
        isOpen={rejectOpen}
        title="Відхилити чернетку"
        overlayZClassName={overlayZ}
        message={
          <Textarea
            autoFocus
            label="Причина"
            placeholder="Що треба виправити"
            minRows={3}
            value={rejectReason}
            onValueChange={setRejectReason}
          />
        }
        confirmText="Відхилити"
        confirmColor="danger"
        confirmLoading={busy === 'reject'}
        onConfirm={() => {
          if (!rejectReason.trim()) {
            ToastService.show({ title: 'Вкажіть причину відхилення', color: 'warning' });
            return;
          }
          void reject();
        }}
        cancelText="Скасувати"
        onCancel={() => setRejectOpen(false)}
      />

      <BaseModal
        isOpen={restoreTarget != null}
        title={`Відновити версію ${restoreTarget ?? ''}`}
        overlayZClassName={overlayZ}
        message={
          <div className="space-y-2">
            <p className="text-sm text-default-600">
              {canApprove
                ? 'Специфікацію буде одразу записано в Dilovod як нову версію.'
                : 'Буде створено чернетку з цією версією, вона чекатиме на затвердження.'}
            </p>
            <Textarea
              label="Коментар"
              placeholder={`Відкат до версії ${restoreTarget ?? ''}`}
              minRows={2}
              value={restoreComment}
              onValueChange={setRestoreComment}
            />
          </div>
        }
        confirmText="Відновити"
        confirmColor="warning"
        confirmLoading={busy === 'restore'}
        onConfirm={() => void restore()}
        cancelText="Скасувати"
        onCancel={() => setRestoreTarget(null)}
      />

      <ConfirmModal
        isOpen={staleConfirmOpen}
        title="Чинну специфікацію змінено"
        message="Після створення чернетки специфікацію змінили (в Backoffice або Dilovod). Затвердження замінить поточну специфікацію вмістом чернетки. Продовжити?"
        confirmText="Затвердити попри це"
        confirmColor="warning"
        onConfirm={() => void approve(true)}
        onCancel={() => setStaleConfirmOpen(false)}
        overlayZClassName={overlayZ}
      />

      <ConfirmModal
        isOpen={discardConfirmOpen}
        title="Видалити чернетку?"
        message="Зміни специфікації з чернетки буде втрачено. Чинна специфікація не зміниться."
        confirmText="Видалити"
        confirmColor="danger"
        onConfirm={() => void discard()}
        onCancel={() => setDiscardConfirmOpen(false)}
        overlayZClassName={overlayZ}
      />
    </>
  );
}
