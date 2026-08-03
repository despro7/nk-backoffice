import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  Spinner,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogGoodDto } from '../ProductsTypes';

interface TrashDrawerProps {
  isOpen: boolean;
  loading?: boolean;
  items: CatalogGoodDto[];
  onClose: () => void;
  onOpenItem: (id: string) => void;
  onRestore: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, ids: string[]) => void;
}

export function TrashDrawer({
  isOpen,
  loading,
  items,
  onClose,
  onOpenItem,
  onRestore,
  onContextMenu,
}: TrashDrawerProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} size="md" placement="right">
      <DrawerContent>
        <DrawerHeader className="flex items-center gap-2">
          <DynamicIcon name="trash-2" size={18} />
          Смітник
        </DrawerHeader>
        <DrawerBody>
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner label="Завантаження…" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-default-400">Смітник порожній</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id}>
                  <div
                    className="flex items-center gap-1 rounded-md hover:bg-default-100"
                    onContextMenu={(e) => {
                      if (!onContextMenu) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onContextMenu(e, [item.id]);
                    }}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                      onClick={() => onOpenItem(item.id)}
                    >
                      <DynamicIcon
                        name={item.isGroup ? 'folder' : 'package'}
                        size={16}
                        className="shrink-0 text-default-400"
                      />
                      <span className="truncate">{item.name}</span>
                      {item.sku && (
                        <span className="ml-1 shrink-0 font-mono text-xs text-default-400 border-1 border-default-200 rounded px-1">
                          {item.sku}
                        </span>
                      )}
                    </button>
                    <Tooltip 
                      content="Відновити" 
                      color="default" 
                      placement="top-end" 
                      showArrow={true} 
                      delay={200} 
                      classNames={{ 
                        base: 'before:rounded-[3px] before:bg-slate-500 before:z-[10]', 
                        content: 'bg-slate-500 text-white rounded-sm' 
                      }}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color="warning"
                        aria-label="Відновити"
                        className="mr-1 my-1 shrink-0"
                        onPress={() => onRestore(item.id)}
                      >
                        <DynamicIcon name="archive-restore" size={16} />
                      </Button>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
