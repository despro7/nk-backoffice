import type { ReactNode } from 'react';
import { Button, Input, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useDebug } from '@/contexts/DebugContext';

interface CatalogToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  branchRefreshing?: boolean;
  fullRefreshing?: boolean;
  onRefreshBranch: () => void;
  onFullRefresh?: () => void;
  showFullRefresh?: boolean;
  onCreateGood: () => void;
  busy?: boolean;
  actions?: ReactNode;
}

export function CatalogToolbar({
  searchQuery,
  onSearchChange,
  branchRefreshing,
  fullRefreshing,
  onRefreshBranch,
  onFullRefresh,
  showFullRefresh,
  onCreateGood,
  busy,
  actions,
}: CatalogToolbarProps) {
  const anyRefreshing = Boolean(branchRefreshing || fullRefreshing);
  const { isDebugMode } = useDebug();

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 md:px-0">
      <Input
        aria-label="Пошук у каталозі"
        placeholder="Пошук за назвою або SKU…"
        value={searchQuery}
        isClearable
        onValueChange={onSearchChange}
        startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
        className="min-w-[180px] max-w-[280px] flex-1 sm:mr-3"
        classNames={{
          inputWrapper: 'bg-gray-50 data-[hover=true]:bg-white! group-data-[focus=true]:bg-white!',
          input: 'placeholder:text-default-400/85',
        }}
        size="sm"
      />

      <Button
        size="sm"
        variant="flat"
        color="primary"
        startContent={<DynamicIcon name="circle-plus" size={14} />}
        className="hidden bg-gradient-to-b from-sky-500 to-blue-600/75 text-white hover:bg-blue-600 font-medium md:inline-flex"
        onPress={onCreateGood}
        isDisabled={busy}
      >
        Додати обʼєкт
      </Button>

      <div className="hidden md:inline-flex">
        <Tooltip
          content="Синхронізувати поточну папку та всі вкладені елементи"
          placement="top-start"
          delay={500}
          showArrow
          classNames={{
            base: 'before:rounded-[2px] before:bottom-[calc(calc(1.25rem/4-2px)*-0.5)]!',
            content: 'border-0 text-xs',
          }}
        >
          <Button
            size="sm"
            color="primary"
            className="bg-gradient-to-b from-lime-500 to-green-600 text-white hover:bg-green-600 font-medium"
            startContent={
              <DynamicIcon
                name={branchRefreshing ? 'refresh-cw' : 'folder-sync'}
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
      </div>

      {showFullRefresh && onFullRefresh && isDebugMode && (
        <div className="hidden md:inline-flex">
          <Tooltip content="Повний pull каталогу з Dilovod (ціни + ШК). Лише ADMIN.">
            <Button
              size="sm"
              variant="flat"
              onPress={onFullRefresh}
              isDisabled={busy || anyRefreshing}
              startContent={
                <DynamicIcon name="refresh-cw" size={14} className={fullRefreshing ? 'animate-spin' : ''} />
              }
              className="bg-danger-500 text-white font-medium"
            >
              Повний refresh
            </Button>
          </Tooltip>
        </div>
      )}

      {actions ? <div className="ml-auto">{actions}</div> : null}
    </div>
  );
}
