import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Button,
  Card,
  CardBody,
  Divider,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
} from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { BaseModal } from '@/components/modals/BaseModal';
import { useProductionSettings } from '@/hooks/useProductionSettings';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { ToastService } from '@/services/ToastService';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  EMPTY_TECH_CARD_PAYLOAD,
  type TechCardDetailDto,
  type TechCardPayload,
  type TechCardVersionSource,
} from '@shared/types/production';
import { pruneTechCardRefs } from '@shared/utils/techCardPayload';
import { useTechCardActions, useTechCardVersions } from '../useTechCards';
import { TechCardComposition } from './TechCardComposition';
import { TechCardEditor } from './TechCardEditor';
import {
  TechCardCoverageNotice,
  TechCardDosingView,
  TechCardPackagingView,
  TechCardStagesView,
} from './TechCardRecipeView';
import { buildSpecRowOptions } from './techCardRecipe';
import { SpecDraftChip, TechCardStatusChip, formatDateTime } from './techCardUi';

type TabKey = 'card' | 'versions' | 'batches';
export type TechCardContext = 'page' | 'drawer';

const VERSION_SOURCE_LABELS: Record<TechCardVersionSource, string> = {
  ui: 'Редагування',
  auto: 'Нова версія специфікації',
  rollback: 'Відкат',
};

const TABLE_CLASS_NAMES = {
  th: 'bg-default-100 text-default-600 text-xs font-semibold first:rounded-l-md last:rounded-r-md',
  td: 'text-sm py-2',
};

function Section({ icon, title, action, children }: { icon: IconName; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-default-900">
          <DynamicIcon name={icon} size={16} className="text-default-500" />
          {title}
        </h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function TabTitle({ icon, children }: { icon: IconName; children: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-flex size-4 shrink-0">
        <DynamicIcon name={icon} size={16} />
      </span>
      {children}
    </span>
  );
}

/** Рядок метаданих техкарти: статус, версії, артикул. */
export function TechCardMeta({ data }: { data: TechCardDetailDto }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
      <TechCardStatusChip status={data.status} />
      {data.spec.draft && <SpecDraftChip status={data.spec.draft.status} />}
      <span>{data.current ? `Техкарта v${data.current.version}` : 'Версій техкарти ще немає'}</span>
      <span>·</span>
      <span>
        {data.spec.currentVersion != null ? `Специфікація v${data.spec.currentVersion}` : 'Специфікація без версії'}
      </span>
      {data.good.sku && (
        <>
          <span>·</span>
          <span className="font-mono">{data.good.sku}</span>
        </>
      )}
    </div>
  );
}

function VersionsTab({ data }: { data: TechCardDetailDto }) {
  const { versions, loading, error } = useTechCardVersions(data.goodId, true);
  const spec = data.spec.current;
  return (
    <div className="space-y-4">
      {spec && (
        <p className="text-sm text-default-600">
          Чинна специфікація: v{spec.version}, {formatDateTime(spec.at)}
          {spec.byName ? `, ${spec.byName}` : ''}.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Table aria-label="Версії техкарти" removeWrapper classNames={TABLE_CLASS_NAMES}>
        <TableHeader>
          <TableColumn>Версія</TableColumn>
          <TableColumn>Специфікація</TableColumn>
          <TableColumn>Джерело</TableColumn>
          <TableColumn>Затвердив</TableColumn>
          <TableColumn>Дата</TableColumn>
          <TableColumn>Коментар</TableColumn>
        </TableHeader>
        <TableBody isLoading={loading} emptyContent={loading ? ' ' : 'Затверджених версій техкарти ще немає'}>
          {versions.map((v) => (
            <TableRow key={v.version}>
              <TableCell className="tabular-nums font-medium">v{v.version}</TableCell>
              <TableCell className="tabular-nums">{v.specVersion != null ? `v${v.specVersion}` : '–'}</TableCell>
              <TableCell>{VERSION_SOURCE_LABELS[v.source]}</TableCell>
              <TableCell>{v.approvedByName ?? v.authorName ?? (v.source === 'auto' ? 'автоматично' : '–')}</TableCell>
              <TableCell className="tabular-nums">{formatDateTime(v.approvedAt ?? v.createdAt)}</TableCell>
              <TableCell className="text-default-500">{v.comment || '–'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type ModalKind = 'submit' | 'reject' | 'discard' | null;

/** Стан чернетки і кнопки модерації (подати, затвердити, відхилити, видалити). */
function ModerationBar({
  data,
  canEdit,
  canApprove,
  busy,
  onEdit,
  onAction,
  detached = false,
}: {
  data: TechCardDetailDto;
  canEdit: boolean;
  canApprove: boolean;
  busy: boolean;
  onEdit: () => void;
  onAction: (kind: Exclude<ModalKind, null> | 'approve') => void;
  /** Окремий блок під карткою (сторінка), а не рядок усередині документа (Drawer) */
  detached?: boolean;
}) {
  const draft = data.draft;
  const specPending = data.spec.draft?.status === 'pending';
  let text: ReactNode = null;
  if (draft?.status === 'editing') {
    text = `Чернетка${draft.lastEditedByName ? `: ${draft.lastEditedByName}` : ''}, ${formatDateTime(draft.updatedAt)}. Ще не подана на затвердження.`;
  } else if (draft?.status === 'pending') {
    text = `На затвердженні${draft.comment ? `: «${draft.comment}»` : ''}${specPending ? ' (разом зі специфікацією)' : ''}.`;
  } else if (draft?.status === 'rejected') {
    text = `Відхилено${draft.rejectReason ? `: «${draft.rejectReason}»` : ''}.`;
  }

  const buttons: ReactNode[] = [];
  if (canEdit) {
    buttons.push(
      <Button key="edit" variant="flat" startContent={<DynamicIcon name="pencil" size={14} />} isDisabled={busy} onPress={onEdit}>
        Редагувати
      </Button>,
    );
  }
  if (canEdit && draft && draft.status !== 'pending') {
    buttons.push(
      <Button key="submit" color="primary" startContent={<DynamicIcon name="send" size={14} />} isDisabled={busy} onPress={() => onAction('submit')}>
        {canApprove ? 'Подати і затвердити' : 'Подати на затвердження'}
      </Button>,
    );
  }
  if (canApprove && draft?.status === 'pending') {
    buttons.push(
      <Button key="approve" color="success" className="text-white" startContent={<DynamicIcon name="check" size={14} />} isDisabled={busy} onPress={() => onAction('approve')}>
        Затвердити
      </Button>,
      <Button key="reject" variant="flat" color="danger" startContent={<DynamicIcon name="x" size={14} />} isDisabled={busy} onPress={() => onAction('reject')}>
        Відхилити
      </Button>,
    );
  }
  if (canEdit && draft) {
    buttons.push(
      <Button key="discard" size="sm" variant="light" color="danger" startContent={<DynamicIcon name="trash-2" size={14} />} isDisabled={busy} onPress={() => onAction('discard')}>
        Видалити чернетку
      </Button>,
    );
  }
  if (!text && buttons.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-end gap-x-3 gap-y-2 ${
        detached ? 'rounded-lg bg-content1 px-4 py-3' : 'border-t border-default-200/60 pt-4'
      }`}
    >
      {text && <p className="mr-auto text-sm text-default-600">{text}</p>}
      <div className="flex flex-wrap justify-end gap-2">{buttons}</div>
    </div>
  );
}

function CardTab({
  data,
  context,
  overlayZ,
  footerTarget,
}: {
  data: TechCardDetailDto;
  context: TechCardContext;
  overlayZ?: string;
  /** Куди винести панель дій (під карткою на сторінці); null – усередині документа */
  footerTarget?: HTMLElement | null;
}) {
  const { settings } = useProductionSettings();
  const { hasPermission } = useRoleAccess();
  const canEdit = hasPermission(PERMISSIONS.ACTION_PRODUCTS_EDIT_SPEC);
  const canApprove = hasPermission(PERMISSIONS.ACTION_PRODUCTS_APPROVE_SPEC);
  const actions = useTechCardActions(data.goodId);
  const renderFooter = (node: ReactNode) => (footerTarget ? createPortal(node, footerTarget) : node);

  const savedPayload = data.draft?.payload ?? data.current?.payload ?? EMPTY_TECH_CARD_PAYLOAD;
  const [editing, setEditing] = useState<{ payload: TechCardPayload; names: TechCardDetailDto['goodNames'] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [modalText, setModalText] = useState('');

  const specDraft = data.spec.draft;
  // Етапи посилаються на рядки специфікації з пари: чернетка, якщо є, інакше чинна
  const specComponents = specDraft?.components ?? data.good.components;
  const specQty = specDraft ? specDraft.specQty : data.good.specQty;
  const rows = useMemo(
    () => buildSpecRowOptions(specComponents, data.units, specQty),
    [specComponents, data.units, specQty],
  );

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      ToastService.show({ title: label, color: 'success' });
      return true;
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося виконати дію',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const payload = pruneTechCardRefs(editing.payload, rows.map((r) => r.rowKey));
    if (await run('Чернетку техкарти збережено', () => actions.saveDraft(payload))) setEditing(null);
  };

  const handleModalConfirm = async () => {
    const text = modalText.trim();
    let ok = false;
    if (modal === 'submit') {
      ok = await run(canApprove ? 'Техкарту затверджено' : 'Техкарту подано на затвердження', async () => {
        await actions.submit(text);
        if (canApprove) await actions.approve();
      });
    } else if (modal === 'reject') {
      ok = await run('Чернетку відхилено', () => actions.reject(text));
    } else if (modal === 'discard') {
      ok = await run('Чернетку видалено', () => actions.discardDraft());
    }
    if (ok) {
      setModal(null);
      setModalText('');
    }
  };

  const specAction =
    context === 'page' ? (
      <Button
        as="a"
        href={`/products#good=${encodeURIComponent(data.goodId)}`}
        target="_blank"
        rel="noreferrer"
        size="sm"
        variant="light"
        startContent={<DynamicIcon name="external-link" size={14} />}
      >
        Редагувати специфікацію
      </Button>
    ) : (
      <span className="text-xs text-default-500">Специфікація редагується в картці товару</span>
    );

  return (
    <div className="flex flex-col gap-5">

      <Section icon="list" title="Склад" action={canEdit ? specAction : undefined}>
        {specDraft && (
          <p className="text-xs text-warning-700">
            Склад показано за чинною версією специфікації. Чернетка
            {specDraft.authorName ? ` (${specDraft.authorName}, ${formatDateTime(specDraft.updatedAt)})` : ''} ще не
            затверджена; етапи посилаються на її рядки.
          </p>
        )}
        <TechCardComposition
          productName={data.good.name}
          components={data.good.components}
          units={data.units}
          specQty={data.good.specQty}
          lossFormula={editing ? (editing.payload.lossFormula ?? settings.lossFormula) : data.lossFormula}
          lossTypes={settings.lossTypes}
        />
      </Section>

      <Divider className="bg-default-200/60" />

      {editing ? (
        <TechCardEditor
          payload={editing.payload}
          rows={rows}
          goodNames={editing.names}
          globalFormula={settings.lossFormula}
          onChange={(payload) => setEditing((prev) => (prev ? { ...prev, payload } : prev))}
          onGoodNamesChange={(names) => setEditing((prev) => (prev ? { ...prev, names } : prev))}
        />
      ) : (
        <>
          <TechCardCoverageNotice payload={savedPayload} rows={rows} />
          <Section icon="list-ordered" title="Етапи">
            <TechCardStagesView payload={savedPayload} rows={rows} />
          </Section>
          <Divider className="bg-default-200/60" />
          <Section icon="package" title="Пакування">
            <TechCardPackagingView payload={savedPayload} goodNames={data.goodNames} />
          </Section>
          <Divider className="bg-default-200/60" />
          <Section icon="scale" title="Дозування">
            <TechCardDosingView payload={savedPayload} rows={rows} />
          </Section>
          <Divider className="bg-default-200/60" />
          <Section icon="sticky-note" title="Примітки">
            {savedPayload.notes ? (
              <p className="whitespace-pre-line text-sm">{savedPayload.notes}</p>
            ) : (
              <p className="text-sm text-default-500">Приміток немає.</p>
            )}
          </Section>
        </>
      )}

      {renderFooter(
        editing ? (
          <div
            className={`flex flex-col gap-3 rounded-lg bg-content1 px-4 py-3 md:flex-row md:items-center ${
              footerTarget ? '' : 'mt-4 border border-default-200'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default-100 text-default-600">
                <DynamicIcon name="pencil-line" size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-default-900">Редагування рецепту</p>
                <p className="text-xs text-default-500">
                  Зміни зберігаються як чернетка й набувають чинності після затвердження.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2">
              <Button variant="flat" isDisabled={busy} onPress={() => setEditing(null)}>
                Скасувати
              </Button>
              <Button
                color="primary"
                isDisabled={busy}
                startContent={
                  <DynamicIcon name={busy ? 'loader-2' : 'save'} size={14} className={busy ? 'animate-spin' : ''} />
                }
                onPress={() => void handleSave()}
              >
                Зберегти чернетку
              </Button>
            </div>
          </div>
        ) : (
          <ModerationBar
            data={data}
            canEdit={canEdit}
            canApprove={canApprove}
            busy={busy}
            onEdit={() => setEditing({ payload: savedPayload, names: data.goodNames })}
            detached={footerTarget != null}
            onAction={(kind) => {
              if (kind === 'approve') void run('Техкарту затверджено', () => actions.approve());
              else {
                setModalText(kind === 'submit' ? data.draft?.comment ?? '' : '');
                setModal(kind);
              }
            }}
          />
        ),
      )}

      <BaseModal
        isOpen={modal != null}
        title={
          modal === 'submit'
            ? canApprove
              ? 'Затвердити техкарту'
              : 'Подати на затвердження'
            : modal === 'reject'
              ? 'Відхилити чернетку'
              : 'Видалити чернетку'
        }
        message={
          modal === 'discard' ? (
            <p className="text-sm">Чернетку техкарти буде видалено. Чинна версія не зміниться.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {modal === 'submit' && data.spec.draft?.status === 'pending' && (
                <p className="text-sm text-default-600">Чернетку специфікації буде затверджено разом із техкартою.</p>
              )}
              {modal === 'reject' && data.spec.draft?.status === 'pending' && (
                <p className="text-sm text-default-600">Чернетку специфікації в парі теж буде відхилено.</p>
              )}
              <Textarea
                autoFocus
                label={modal === 'reject' ? 'Причина' : 'Що змінено'}
                minRows={2}
                value={modalText}
                onValueChange={setModalText}
              />
            </div>
          )
        }
        confirmText={modal === 'discard' ? 'Видалити' : modal === 'reject' ? 'Відхилити' : canApprove ? 'Затвердити' : 'Подати'}
        confirmColor={modal === 'submit' ? 'primary' : 'danger'}
        cancelText="Скасувати"
        confirmLoading={busy}
        overlayZClassName={overlayZ}
        onConfirm={() => {
          if (modal !== 'discard' && !modalText.trim()) {
            ToastService.show({ title: modal === 'reject' ? 'Вкажіть причину' : 'Опишіть зміни', color: 'warning' });
            return;
          }
          void handleModalConfirm();
        }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}

/** Документ техкарти: вкладки «Техкарта», «Версії / Історія», «Варки». Спільний для сторінки і Drawer. */
export function TechCardDocument({
  data,
  context = 'page',
  overlayZ,
}: {
  data: TechCardDetailDto;
  context?: TechCardContext;
  /** z-index модалок поверх вкладеного Drawer */
  overlayZ?: string;
}) {
  const [tab, setTab] = useState<TabKey>('card');
  // На сторінці панель дій стоїть під карткою, як і вкладки над нею
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const body = (
    <>
      {tab === 'card' && (
        <CardTab
          data={data}
          context={context}
          overlayZ={overlayZ}
          footerTarget={context === 'page' ? footerEl : null}
        />
      )}
      {tab === 'versions' && <VersionsTab data={data} />}
      {tab === 'batches' && <p className="text-sm text-default-500">Варок за цією техкартою ще немає.</p>}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        size="md"
        color="primary"
        aria-label="Розділи техкарти"
        selectedKey={tab}
        onSelectionChange={(key) => setTab(String(key) as TabKey)}
        classNames={{
          base: 'self-start p-1 mt-4 bg-gray-100 rounded-lg',
          tabList: 'gap-2 p-0.5 bg-transparent rounded-md',
          cursor: 'bg-primary text-white shadow-sm rounded-md',
          tab: 'px-3 py-1.5 text-sm font-normal data-[hover-unselected=true]:opacity-100',
          tabContent: 'group-data-[selected=true]:text-white text-neutral-500',
        }}
      >
        <Tab key="card" title={<TabTitle icon="file-text">Техкарта</TabTitle>} />
        <Tab key="versions" title={<TabTitle icon="history">Версії / Історія</TabTitle>} />
        <Tab key="batches" title={<TabTitle icon="cooking-pot">Варки</TabTitle>} />
      </Tabs>

      {context === 'page' ? (
        // На сторінці вкладки стоять над карткою, вміст – у картці
        <>
          <Card className="shadow-none rounded-lg">
            <CardBody className="p-4">{body}</CardBody>
          </Card>
          <div ref={setFooterEl} className="empty:hidden" />
        </>
      ) : (
        body
      )}
    </div>
  );
}
