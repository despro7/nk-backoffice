import { Button, Input, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useDebug } from '@/contexts/DebugContext';

interface CatalogToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCount: number;
  branchRefreshing?: boolean;
  syncingSelected?: boolean;
  fullRefreshing?: boolean;
  onRefreshBranch: () => void;
  onSyncSelected: () => void;
  /** Оновлення обраних SKU у legacy `products` через Dilovod sync-manual */
  onLegacyUpdate: () => void;
  legacyUpdating?: boolean;
  onFullRefresh?: () => void;
  showFullRefresh?: boolean;
  onCreateGood: () => void;
  onDuplicate: () => void;
  /** true = всередині архіву / обрані архівні → «Відновити з архіву» */
  isInsideArchive?: boolean;
  onArchive: () => void;
  onRestore: () => void;
  /** true = обрані зі смітника → «Відновити» замість «Видалити» */
  isInsideTrash?: boolean;
  onTrash: () => void;
  onRestoreFromTrash?: () => void;
  onOpenTrash: () => void;
  busy?: boolean;
}

export function CatalogToolbar({
  searchQuery,
  onSearchChange,
  selectedCount,
  branchRefreshing,
  syncingSelected,
  fullRefreshing,
  onRefreshBranch,
  onSyncSelected,
  onLegacyUpdate,
  legacyUpdating,
  onFullRefresh,
  showFullRefresh,
  onCreateGood,
  onDuplicate,
  isInsideArchive,
  onArchive,
  onRestore,
  isInsideTrash,
  onTrash,
  onRestoreFromTrash,
  onOpenTrash,
  busy,
}: CatalogToolbarProps) {
  const hasSelection = selectedCount > 0;
  const anyRefreshing = Boolean(
    branchRefreshing || syncingSelected || fullRefreshing || legacyUpdating
  );
  const { isDebugMode } = useDebug();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Пошук у каталозі"
        placeholder="Пошук за назвою або SKU…"
        value={searchQuery}
        isClearable
        onValueChange={onSearchChange}
        startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
        className="max-w-[280px] mr-3"
        classNames={{ inputWrapper: 'bg-gray-50 data-[hover=true]:bg-white! group-data-[focus=true]:bg-white!', input: 'placeholder:text-default-400/85' }}
        size="sm"
      />

      <Button
        size="sm"
        variant="flat"
        color="primary"
        startContent={<DynamicIcon name="circle-plus" size={14} />}
        className="bg-gradient-to-br from-cyan-500 to-blue-500 text-white hover:bg-cyan-500/90 font-medium"
        onPress={onCreateGood}
        isDisabled={busy}
      >
        Додати обʼєкт
      </Button>

      <Tooltip content="Синхронізувати поточну папку та всі вкладені елементи">
        <Button
          size="sm"
          color="primary"
          className="bg-slate-500 text-white hover:bg-slate-500/90 font-medium"
          startContent={
            <DynamicIcon
              name={branchRefreshing ? "refresh-cw" : "folder-sync"}
              size={14}
              className={branchRefreshing ? 'animate-spin' : ''}
            />
          }
          onPress={onRefreshBranch}
          isDisabled={busy || anyRefreshing}
        >
          Синхронізувати гілку
        </Button>
      </Tooltip>

      {showFullRefresh && onFullRefresh && isDebugMode && (
        <Tooltip content="Повний pull каталогу з Dilovod (ціни + ШК). Лише ADMIN.">
          <Button
            size="sm"
            variant="flat"
            onPress={onFullRefresh}
            isDisabled={busy || anyRefreshing}
            startContent={<DynamicIcon name="refresh-cw" size={14} className={fullRefreshing ? 'animate-spin' : ''}/>}
            className="bg-danger-500 text-white font-medium"
          >
            Повний refresh
          </Button>
        </Tooltip>
      )}

      {hasSelection && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-default-500">Обрано: {selectedCount}</span>
          {/* <Button
            size="sm"
            className="bg-slate-500 text-white hover:bg-slate-500/90 font-medium"
            startContent={
              <DynamicIcon
                name={syncingSelected ? "refresh-cw" : "cloud-download"}
                size={14}
                className={syncingSelected ? 'animate-spin' : ''}
              />
            }
            onPress={onSyncSelected}
            isDisabled={busy || anyRefreshing}
          >
            Синхронізувати з Діловодом
          </Button> */}
          <Button
            size="sm"
            className="bg-slate-500 text-white hover:bg-slate-500/90 font-medium"
            startContent={<DynamicIcon name="copy" size={14} />}
            onPress={onDuplicate}
            isDisabled={busy || selectedCount !== 1}
          >
            Дублювати
          </Button>
          <Tooltip content="Оновити обрані товари в legacy таблиці products (Dilovod sync-manual за SKU)">
            <Button
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-600/90 font-medium"
              startContent={
                <DynamicIcon
                  name={legacyUpdating ? 'refresh-cw' : 'database'}
                  size={14}
                  className={legacyUpdating ? 'animate-spin' : ''}
                />
              }
              onPress={onLegacyUpdate}
              isDisabled={busy || anyRefreshing}
            >
              Legacy Update
            </Button>
          </Tooltip>
          {!isInsideTrash &&
            (isInsideArchive ? (
              <Button
                size="sm"
                className="bg-emerald-500 text-white hover:bg-emerald-500/90 font-medium"
                startContent={<DynamicIcon name="archive-restore" size={14} />}
                onPress={onRestore}
                isDisabled={busy}
              >
                Відновити з архіву
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-yellow-500 text-white hover:bg-yellow-500/90 font-medium"
                startContent={<DynamicIcon name="archive" size={14} />}
                onPress={onArchive}
                isDisabled={busy}
              >
                В архів
              </Button>
            ))}
          {isInsideTrash ? (
            <Button
              size="sm"
              className="bg-emerald-500 text-white hover:bg-emerald-500/90 font-medium"
              startContent={<DynamicIcon name="archive-restore" size={14} />}
              onPress={onRestoreFromTrash}
              isDisabled={busy || !onRestoreFromTrash}
            >
              Відновити
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-danger-500 text-white hover:bg-red-500/90 font-medium"
              startContent={<DynamicIcon name="trash-2" size={14} />}
              onPress={onTrash}
              isDisabled={busy}
            >
              Видалити
            </Button>
          )}
        </div>
      )}
      
      <Tooltip content="Переглянути видалені елементи">
        <Button
          size="sm"
          variant="flat"
          color="danger"
          aria-label="Смітник"
          className={`font-medium ${!hasSelection && "ml-auto"}`}
          onPress={onOpenTrash}
        >
          <DynamicIcon name="trash-2" size={14} />
          Смітник
        </Button>
      </Tooltip>
    </div>
  );
}
