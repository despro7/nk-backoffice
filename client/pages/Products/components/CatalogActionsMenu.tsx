import { DynamicIcon } from 'lucide-react/dynamic';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownTrigger,
} from '@heroui/react';
import { useDebug } from '@/contexts/DebugContext';

export const CATALOG_ACTIONS_MENU_PANEL =
  'min-w-[200px] overflow-hidden rounded-lg border border-default-200 bg-content1 p-2 shadow-lg';

export interface CatalogActionsMenuItemsProps {
  ids: string[];
  busy?: boolean;
  fromTrash?: boolean;
  fromArchive?: boolean;
  groupsOnly?: boolean;
  onEdit?: (id: string) => void;
  onSyncFromDilovod: (ids: string[]) => void;
  onLegacyUpdate: (ids: string[]) => void;
  onMoveTo: (ids: string[]) => void;
  onChangeType: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onArchive: (ids: string[]) => void;
  onRestore: (ids: string[]) => void;
  onTrash: (ids: string[]) => void;
  onRestoreFromTrash: (ids: string[]) => void;
  onClose?: () => void;
}

export function CatalogActionsMenuItems({
  ids,
  busy,
  fromTrash,
  fromArchive,
  groupsOnly,
  onEdit,
  onSyncFromDilovod,
  onLegacyUpdate,
  onMoveTo,
  onChangeType,
  onDuplicate,
  onArchive,
  onRestore,
  onTrash,
  onRestoreFromTrash,
  onClose,
}: CatalogActionsMenuItemsProps) {
  const canDuplicate = ids.length === 1 && !busy;
  const canBulk = ids.length > 0 && !busy;
  const inTrash = Boolean(fromTrash);
  const inArchive = Boolean(fromArchive) && !inTrash;
  const onlyGroups = Boolean(groupsOnly);
  const canEditGroup = Boolean(onEdit) && onlyGroups && ids.length === 1 && !busy;

  const run = (action: (ids: string[]) => void) => {
    action(ids);
    onClose?.();
  };

  return (
    <>
      {ids.length > 1 && (
        <div className="border-b border-default-100 px-3 py-1.5 text-xs text-default-500">
          Обрано: {ids.length}
        </div>
      )}

      {canEditGroup && (
        <CatalogMenuItem
          icon="pencil"
          label="Редагувати групу"
          onSelect={() => {
            onEdit?.(ids[0]);
            onClose?.();
          }}
        />
      )}
      <CatalogMenuItem
        icon="cloud-download"
        label="Синхронізувати з Діловодом"
        disabled={!canBulk}
        onSelect={() => run(onSyncFromDilovod)}
      />
      {!onlyGroups && (
        <CatalogMenuItem
          icon="database"
          label="Синхронізувати товар(и)"
          disabled={!canBulk}
          legacy
          onSelect={() => run(onLegacyUpdate)}
        />
      )}
      <CatalogMenuItem
        icon="folder-input"
        label="Перемістити в…"
        disabled={!canBulk}
        onSelect={() => run(onMoveTo)}
      />
      {!onlyGroups && (
        <CatalogMenuItem
          icon="shapes"
          label="Змінити тип"
          disabled={!canBulk}
          onSelect={() => run(onChangeType)}
        />
      )}
      <CatalogMenuItem
        icon="copy"
        label="Дублювати"
        disabled={!canDuplicate}
        onSelect={() => run(onDuplicate)}
      />
      {!inTrash &&
        (inArchive ? (
          <CatalogMenuItem
            icon="archive-restore"
            label="Відновити з архіву"
            disabled={!canBulk}
            onSelect={() => run(onRestore)}
          />
        ) : (
          <CatalogMenuItem
            icon="archive"
            label="В архів"
            disabled={!canBulk}
            onSelect={() => run(onArchive)}
          />
        ))}
      {inTrash ? (
        <CatalogMenuItem
          icon="archive-restore"
          label="Відновити"
          disabled={!canBulk}
          onSelect={() => run(onRestoreFromTrash)}
        />
      ) : (
        <CatalogMenuItem
          icon="trash-2"
          label="Видалити"
          danger
          disabled={!canBulk}
          onSelect={() => run(onTrash)}
        />
      )}
    </>
  );
}

function CatalogMenuItem({
  icon,
  label,
  danger,
  legacy,
  disabled,
  onSelect,
}: {
  icon:
    | 'copy'
    | 'archive'
    | 'trash-2'
    | 'folder-input'
    | 'archive-restore'
    | 'cloud-download'
    | 'database'
    | 'pencil'
    | 'shapes';
  label: string;
  danger?: boolean;
  legacy?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={[
        'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors',
        disabled
          ? 'cursor-not-allowed text-default-300'
          : danger
            ? 'text-danger hover:bg-danger-50'
            : 'text-foreground hover:bg-default-100',
        legacy ? 'text-lime-600 hover:bg-lime-100' : '',
      ].join(' ')}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onSelect();
      }}
    >
      <DynamicIcon name={icon} size={14} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
}

interface CatalogActionsDropdownProps extends Omit<CatalogActionsMenuItemsProps, 'onClose'> {
  onCreateGood: () => void;
  onRefreshBranch: () => void;
  branchRefreshing?: boolean;
  onRefreshStock: () => void;
  stockRefreshing?: boolean;
  onFullRefresh?: () => void;
  fullRefreshing?: boolean;
  showFullRefresh?: boolean;
  /** Показати грибінці ручного сортування в таблиці */
  listSortEnabled?: boolean;
  onListSortToggle?: () => void;
  /** Вимкнено, коли таблиця відсортована за колонкою */
  listSortDisabled?: boolean;
}

export function CatalogActionsDropdown({
  ids,
  busy,
  fromTrash,
  fromArchive,
  groupsOnly,
  onEdit,
  onSyncFromDilovod,
  onLegacyUpdate,
  onMoveTo,
  onChangeType,
  onDuplicate,
  onArchive,
  onRestore,
  onTrash,
  onRestoreFromTrash,
  onCreateGood,
  onRefreshBranch,
  branchRefreshing,
  onRefreshStock,
  stockRefreshing,
  onFullRefresh,
  fullRefreshing,
  showFullRefresh,
  listSortEnabled = false,
  onListSortToggle,
  listSortDisabled = false,
}: CatalogActionsDropdownProps) {
  const canDuplicate = ids.length === 1 && !busy;
  const canBulk = ids.length > 0 && !busy;
  const inTrash = Boolean(fromTrash);
  const inArchive = Boolean(fromArchive) && !inTrash;
  const onlyGroups = Boolean(groupsOnly);
  const canEditGroup = Boolean(onEdit) && onlyGroups && ids.length === 1 && !busy;
  const catalogBusy = Boolean(busy || branchRefreshing || stockRefreshing || fullRefreshing);
  const { isDebugMode } = useDebug();
  const showDebugRefresh = Boolean(showFullRefresh && onFullRefresh && isDebugMode);
  const sectionDivider = { className: 'mt-1 bg-neutral-200' };

  const listSortOff = listSortDisabled || !listSortEnabled;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        isDisabled={listSortDisabled}
        aria-label="Сортувати список"
        aria-pressed={listSortEnabled && !listSortDisabled}
        onPress={onListSortToggle}
        className={
          listSortEnabled && !listSortDisabled
            ? 'min-w-8 bg-slate-600 px-2 font-medium text-slate-100 md:px-3'
            : 'min-w-8 bg-default-100 px-2 font-medium text-default-500 md:px-3'
        }
        startContent={
          <DynamicIcon
            name="arrow-up-down"
            size={16}
            className={`shrink-0 ${listSortOff ? 'text-default-400' : 'text-slate-100'}`}
          />
        }
      >
        <span className="hidden md:inline">Сортувати список</span>
      </Button>
      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Button
            size="sm"
            className="bg-slate-600 font-medium text-slate-100"
            aria-label="Дії"
          >
            Дії <DynamicIcon name="chevron-down" size={16} />
          </Button>
        </DropdownTrigger>
      <DropdownMenu
        aria-label="Дії з каталогом"
        onAction={(key) => {
          switch (String(key)) {
            case 'create':
              onCreateGood();
              break;
            case 'refreshBranch':
              onRefreshBranch();
              break;
            case 'refreshStock':
              onRefreshStock();
              break;
            case 'fullRefresh':
              if (showDebugRefresh) onFullRefresh?.();
              break;
            case 'editGroup':
              if (ids[0]) onEdit?.(ids[0]);
              break;
            case 'syncDilovod':
              onSyncFromDilovod(ids);
              break;
            case 'legacyUpdate':
              onLegacyUpdate(ids);
              break;
            case 'moveTo':
              onMoveTo(ids);
              break;
            case 'changeType':
              onChangeType(ids);
              break;
            case 'duplicate':
              onDuplicate(ids);
              break;
            case 'archive':
              onArchive(ids);
              break;
            case 'restoreArchive':
              onRestore(ids);
              break;
            case 'restoreTrash':
              onRestoreFromTrash(ids);
              break;
            case 'trash':
              onTrash(ids);
              break;
            default:
              break;
          }
        }}
      >
        <DropdownSection
          title="Каталог"
          showDivider
          dividerProps={sectionDivider}
          className="md:hidden"
        >
          <DropdownItem
            key="create"
            isDisabled={busy}
            startContent={<DynamicIcon name="circle-plus" size={16} className="shrink-0" />}
          >
            Додати обʼєкт
          </DropdownItem>
          <DropdownItem
            key="refreshBranch"
            isDisabled={catalogBusy}
            startContent={
              <DynamicIcon
                name={branchRefreshing ? 'refresh-cw' : 'folder-sync'}
                size={16}
                className={`shrink-0 ${branchRefreshing ? 'animate-spin' : ''}`}
              />
            }
          >
            Синхронізувати гілку
          </DropdownItem>
          <DropdownItem
            key="refreshStock"
            isDisabled={catalogBusy}
            className="text-amber-600"
            startContent={
              <DynamicIcon
                name={stockRefreshing ? 'refresh-cw' : 'boxes'}
                size={16}
                className={`shrink-0 ${stockRefreshing ? 'animate-spin' : ''}`}
              />
            }
          >
            Оновити залишки
          </DropdownItem>
          <DropdownItem
            key="fullRefresh"
            className={showDebugRefresh ? 'text-danger' : 'hidden'}
            isDisabled={catalogBusy}
            startContent={<DynamicIcon name="refresh-cw" size={16} className="shrink-0" />}
          >
            Повний refresh
          </DropdownItem>
        </DropdownSection>

        <DropdownSection
          title={ids.length > 1 ? `Обране (${ids.length})` : 'Обране'}
          showDivider
          dividerProps={sectionDivider}
        >
          <DropdownItem
            key="editGroup"
            className={canEditGroup ? '' : 'hidden'}
            startContent={<DynamicIcon name="pencil" size={16} className="shrink-0" />}
          >
            Редагувати групу
          </DropdownItem>
          <DropdownItem
            key="syncDilovod"
            isDisabled={!canBulk}
            startContent={<DynamicIcon name="cloud-download" size={16} className="shrink-0" />}
          >
            Синхронізувати з Діловодом
          </DropdownItem>
          <DropdownItem
            key="legacyUpdate"
            className={onlyGroups ? 'hidden' : 'text-lime-600'}
            isDisabled={!canBulk}
            startContent={<DynamicIcon name="database" size={16} className="shrink-0" />}
          >
            Синхронізувати товар(и)
          </DropdownItem>
          <DropdownItem
            key="moveTo"
            isDisabled={!canBulk}
            startContent={<DynamicIcon name="folder-input" size={16} className="shrink-0" />}
          >
            Перемістити в…
          </DropdownItem>
          <DropdownItem
            key="changeType"
            className={onlyGroups ? 'hidden' : ''}
            isDisabled={!canBulk}
            startContent={<DynamicIcon name="shapes" size={16} className="shrink-0" />}
          >
            Змінити тип
          </DropdownItem>
          <DropdownItem
            key="duplicate"
            isDisabled={!canDuplicate}
            startContent={<DynamicIcon name="copy" size={16} className="shrink-0" />}
          >
            Дублювати
          </DropdownItem>
        </DropdownSection>

        <DropdownSection>
          <DropdownItem
            key="restoreArchive"
            className={!inTrash && inArchive ? '' : 'hidden'}
            isDisabled={!canBulk}
            startContent={<DynamicIcon name="archive-restore" size={16} className="shrink-0" />}
          >
            Відновити з архіву
          </DropdownItem>
          <DropdownItem
            key="archive"
            className={!inTrash && !inArchive ? '' : 'hidden'}
            isDisabled={!canBulk}
            startContent={<DynamicIcon name="archive" size={16} className="shrink-0" />}
          >
            В архів
          </DropdownItem>
          <DropdownItem
            key="restoreTrash"
            className={inTrash ? '' : 'hidden'}
            isDisabled={!canBulk}
            startContent={<DynamicIcon name="archive-restore" size={16} className="shrink-0" />}
          >
            Відновити
          </DropdownItem>
          <DropdownItem
            key="trash"
            className={inTrash ? 'hidden' : ''}
            color="danger"
            isDisabled={!canBulk}
            startContent={<DynamicIcon name="trash-2" size={16} className="shrink-0" />}
          >
            Видалити
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
    </div>
  );
}
