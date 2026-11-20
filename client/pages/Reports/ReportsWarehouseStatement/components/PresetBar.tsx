import { useMemo, useState, type ReactElement } from 'react';
import {
  Button,
  Checkbox,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownTrigger,
  Input,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { BaseModal } from '@/components/modals/BaseModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import {
  WAREHOUSE_STATEMENT_PRESET_NAME_MAX,
  type WarehouseStatementPresetSpec,
  type WarehouseStatementPresetView,
  type WarehouseStatementPresetVisibility,
} from '@shared/types/warehouseStatement';
import {
  presetSpecSignature,
  relativePeriodKey,
  type WarehouseStatementHistoryEntry,
} from '../warehouseStatementUtils';

interface PresetBarProps {
  presets: WarehouseStatementPresetView[];
  activePresetId: number | null;
  datePresetKey: string | null;
  saving: boolean;
  history: WarehouseStatementHistoryEntry[];
  currentSpec: (visibility: WarehouseStatementPresetVisibility) => WarehouseStatementPresetSpec | null;
  onApply: (preset: WarehouseStatementPresetView) => void;
  onApplyHistory: (entry: WarehouseStatementHistoryEntry) => void;
  onClearHistory: () => void;
  onDetach: () => void;
  onCreate: (input: {
    name: string;
    visibility: WarehouseStatementPresetVisibility;
  }) => Promise<WarehouseStatementPresetView | undefined>;
  onUpdate: (
    id: number,
    body: { name?: string; visibility?: WarehouseStatementPresetVisibility; spec?: WarehouseStatementPresetSpec },
  ) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}

type NameDialog =
  | { mode: 'create'; name: string; visibility: WarehouseStatementPresetVisibility }
  | { mode: 'rename'; id: number; name: string };

const TOOLTIP_CLASSES = {
  base: 'before:bg-gray-700 before:rounded-[2px]',
  content: 'bg-gray-700 border-0 text-white text-xs max-w-xs',
};

function formatHistoryTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function VisibilityIcon({ visibility }: { visibility: WarehouseStatementPresetVisibility }) {
  return (
    <DynamicIcon
      name={visibility === 'public' ? 'globe' : 'lock'}
      size={14}
      className="shrink-0 text-default-400"
    />
  );
}

export default function PresetBar({
  presets,
  activePresetId,
  datePresetKey,
  saving,
  history,
  currentSpec,
  onApply,
  onApplyHistory,
  onClearHistory,
  onDetach,
  onCreate,
  onUpdate,
  onDelete,
}: PresetBarProps) {
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseStatementPresetView | null>(null);

  const active = useMemo(
    () => presets.find((item) => item.id === activePresetId) ?? null,
    [activePresetId, presets],
  );
  const own = presets.filter((item) => item.isOwn);
  const shared = presets.filter((item) => !item.isOwn);

  const dirty = useMemo(() => {
    if (!active) {
      return false;
    }
    const spec = currentSpec(active.visibility);
    return spec ? presetSpecSignature(spec) !== presetSpecSignature(active.spec) : false;
  }, [active, currentSpec]);

  const hasCustomPeriod = !relativePeriodKey(datePresetKey);

  const saveChanges = async () => {
    if (!active) {
      return;
    }
    const spec = currentSpec(active.visibility);
    if (spec) {
      await onUpdate(active.id, { spec });
    }
  };

  const toggleVisibility = async () => {
    if (!active) {
      return;
    }
    await onUpdate(active.id, { visibility: active.visibility === 'public' ? 'private' : 'public' });
  };

  const submitNameDialog = async () => {
    if (!nameDialog) {
      return;
    }
    const name = nameDialog.name.trim();
    if (!name) {
      return;
    }
    try {
      if (nameDialog.mode === 'create') {
        await onCreate({ name, visibility: nameDialog.visibility });
      } else {
        await onUpdate(nameDialog.id, { name });
      }
      setNameDialog(null);
    } catch {
      // toast показує хук
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await onDelete(deleteTarget.id);
      if (deleteTarget.id === activePresetId) {
        onDetach();
      }
      setDeleteTarget(null);
    } catch {
      // toast показує хук
    }
  };

  const renderPresetItem = (preset: WarehouseStatementPresetView) => (
    <DropdownItem
      key={String(preset.id)}
      startContent={<VisibilityIcon visibility={preset.visibility} />}
      description={preset.isOwn ? undefined : `Автор: ${preset.ownerName}`}
      endContent={
        preset.id === activePresetId ? <DynamicIcon name="check" size={14} className="text-primary" /> : null
      }
    >
      {preset.name}
    </DropdownItem>
  );

  const presetSections = [
    own.length > 0 ? (
      <DropdownSection key="own" title="Мої" showDivider={shared.length > 0}>
        {own.map(renderPresetItem)}
      </DropdownSection>
    ) : null,
    shared.length > 0 ? (
      <DropdownSection key="shared" title="Публічні">
        {shared.map(renderPresetItem)}
      </DropdownSection>
    ) : null,
  ].filter((item): item is ReactElement => item !== null);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Dropdown placement="bottom-start">
        <DropdownTrigger>
          <Button
            size="sm"
            variant="flat"
            className="max-w-64"
            startContent={<DynamicIcon name="bookmark" size={14} className="shrink-0" />}
            endContent={<DynamicIcon name="chevron-down" size={14} className="shrink-0" />}
          >
            <span className="truncate">{active ? active.name : 'Пресети'}</span>
          </Button>
        </DropdownTrigger>
        {presetSections.length > 0 ? (
          <DropdownMenu
            aria-label="Збережені пресети"
            className="max-h-96 overflow-y-auto"
            onAction={(key) => {
              const preset = presets.find((item) => String(item.id) === String(key));
              if (preset) {
                onApply(preset);
              }
            }}
          >
            {presetSections}
          </DropdownMenu>
        ) : (
          <DropdownMenu aria-label="Збережені пресети" disabledKeys={['empty']}>
            <DropdownItem key="empty" description="Налаштуйте конструктор і натисніть «Зберегти як…»">
              Пресетів ще немає
            </DropdownItem>
          </DropdownMenu>
        )}
      </Dropdown>

      {active && dirty ? (
        <Chip size="sm" variant="flat" color="warning">
          змінено
        </Chip>
      ) : null}

      {active?.canEdit && dirty ? (
        <Tooltip content="Зберегти зміни в пресет" delay={300} showArrow classNames={TOOLTIP_CLASSES}>
          <Button
            size="sm"
            variant="flat"
            isIconOnly
            aria-label="Зберегти зміни в пресет"
            isDisabled={saving}
            onPress={() => void saveChanges()}
          >
            <DynamicIcon
              name={saving ? 'loader-2' : 'save'}
              size={15}
              className={saving ? 'animate-spin' : ''}
            />
          </Button>
        </Tooltip>
      ) : null}

      <Tooltip content="Зберегти як новий пресет" delay={300} showArrow classNames={TOOLTIP_CLASSES}>
        <Button
          size="sm"
          variant="light"
          isIconOnly
          aria-label="Зберегти як новий пресет"
          onPress={() =>
            setNameDialog({
              mode: 'create',
              name: active && !active.isOwn ? active.name : '',
              visibility: 'private',
            })
          }
        >
          <DynamicIcon name="bookmark-plus" size={16} />
        </Button>
      </Tooltip>

      {active ? (
        <Dropdown placement="bottom-start">
          <DropdownTrigger>
            <Button size="sm" variant="light" isIconOnly aria-label="Дії з пресетом">
              <DynamicIcon name="ellipsis" size={16} />
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Дії з пресетом"
            disabledKeys={active.canEdit ? [] : ['rename', 'visibility', 'delete']}
            onAction={(key) => {
              if (key === 'rename') {
                setNameDialog({ mode: 'rename', id: active.id, name: active.name });
              } else if (key === 'visibility') {
                void toggleVisibility();
              } else if (key === 'delete') {
                setDeleteTarget(active);
              } else if (key === 'reset') {
                onApply(active);
              } else if (key === 'detach') {
                onDetach();
              }
            }}
          >
            <DropdownSection showDivider>
              <DropdownItem
                key="reset"
                startContent={<DynamicIcon name="rotate-ccw" size={14} />}
                description="Скинути незбережені зміни"
              >
                Повернути збережене
              </DropdownItem>
              <DropdownItem key="detach" startContent={<DynamicIcon name="unlink" size={14} />}>
                Відʼєднати від пресету
              </DropdownItem>
            </DropdownSection>
            <DropdownSection>
              <DropdownItem key="rename" startContent={<DynamicIcon name="pencil" size={14} />}>
                Перейменувати
              </DropdownItem>
              <DropdownItem
                key="visibility"
                startContent={
                  <DynamicIcon name={active.visibility === 'public' ? 'lock' : 'globe'} size={14} />
                }
                description={
                  active.visibility === 'public'
                    ? 'Бачитимете лише ви'
                    : 'Бачитимуть усі; довільні дати не зберігаються'
                }
              >
                {active.visibility === 'public' ? 'Зробити приватним' : 'Зробити публічним'}
              </DropdownItem>
              <DropdownItem
                key="delete"
                className="text-danger"
                color="danger"
                startContent={<DynamicIcon name="trash-2" size={14} />}
              >
                Видалити
              </DropdownItem>
            </DropdownSection>
          </DropdownMenu>
        </Dropdown>
      ) : null}

      <Dropdown placement="bottom-start">
        <DropdownTrigger>
          <Button size="sm" variant="light" isIconOnly aria-label="Останні запуски" title="Останні запуски">
            <DynamicIcon name="history" size={16} />
          </Button>
        </DropdownTrigger>
        {history.length > 0 ? (
          <DropdownMenu
            aria-label="Останні запуски"
            className="max-h-96 overflow-y-auto"
            onAction={(key) => {
              if (key === 'clear') {
                onClearHistory();
                return;
              }
              const entry = history[Number(key)];
              if (entry) {
                onApplyHistory(entry);
              }
            }}
          >
            <DropdownSection title="Останні запуски" showDivider>
              {history.map((entry, index) => (
                <DropdownItem
                  key={String(index)}
                  description={formatHistoryTime(entry.at)}
                  startContent={<DynamicIcon name="clock" size={14} className="text-default-400" />}
                >
                  {entry.summary || 'Відомість'}
                </DropdownItem>
              ))}
            </DropdownSection>
            <DropdownSection>
              <DropdownItem
                key="clear"
                className="text-danger"
                color="danger"
                startContent={<DynamicIcon name="eraser" size={14} />}
              >
                Очистити історію
              </DropdownItem>
            </DropdownSection>
          </DropdownMenu>
        ) : (
          <DropdownMenu aria-label="Останні запуски" disabledKeys={['empty']}>
            <DropdownItem key="empty" description="Зʼявляться після «Сформувати»">
              Історія порожня
            </DropdownItem>
          </DropdownMenu>
        )}
      </Dropdown>

      <BaseModal
        isOpen={nameDialog !== null}
        title={nameDialog?.mode === 'rename' ? 'Перейменувати пресет' : 'Новий пресет'}
        icon={<DynamicIcon name={nameDialog?.mode === 'rename' ? 'pencil' : 'bookmark-plus'} size={18} />}
        confirmText={nameDialog?.mode === 'rename' ? 'Перейменувати' : 'Зберегти'}
        cancelText="Скасувати"
        confirmLoading={saving}
        onCancel={() => setNameDialog(null)}
        onConfirm={() => void submitNameDialog()}
        message={
          nameDialog ? (
            <div className="flex flex-col gap-3">
              <Input
                autoFocus
                size="sm"
                label="Назва"
                maxLength={WAREHOUSE_STATEMENT_PRESET_NAME_MAX}
                value={nameDialog.name}
                onValueChange={(name) => setNameDialog({ ...nameDialog, name })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitNameDialog();
                  }
                }}
              />
              {nameDialog.mode === 'create' ? (
                <>
                  <Checkbox
                    size="sm"
                    isSelected={nameDialog.visibility === 'public'}
                    onValueChange={(selected) =>
                      setNameDialog({ ...nameDialog, visibility: selected ? 'public' : 'private' })
                    }
                  >
                    Публічний (бачать усі з доступом до звіту)
                  </Checkbox>
                  {nameDialog.visibility === 'public' && hasCustomPeriod ? (
                    <p className="text-xs text-default-500">
                      Обрано довільні дати: у публічний пресет період не потрапить, буде взято поточний період
                      користувача.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null
        }
      />

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Видалити пресет?"
        message={
          deleteTarget ? (
            <span>
              Пресет «{deleteTarget.name}» буде видалено
              {deleteTarget.visibility === 'public' ? ' для всіх користувачів' : ''}. Дію не можна скасувати.
            </span>
          ) : null
        }
        confirmText="Видалити"
        cancelText="Скасувати"
        confirmColor="danger"
        confirmLoading={saving}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
