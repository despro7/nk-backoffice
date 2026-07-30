import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  Spinner,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogGoodDto } from '../ProductsTypes';

interface TrashDrawerProps {
  isOpen: boolean;
  loading?: boolean;
  items: CatalogGoodDto[];
  onClose: () => void;
  onOpenItem: (id: string) => void;
}

export function TrashDrawer({
  isOpen,
  loading,
  items,
  onClose,
  onOpenItem,
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
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-default-100"
                    onClick={() => onOpenItem(item.id)}
                  >
                    <DynamicIcon
                      name={item.isGroup ? 'folder' : 'package'}
                      size={16}
                      className="text-default-400"
                    />
                    <span className="truncate">{item.name}</span>
                    {item.sku && (
                      <span className="ml-auto font-mono text-xs text-default-400">{item.sku}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
