import { Button, Drawer, DrawerBody, DrawerContent, DrawerHeader, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { NESTED_DRAWER_Z } from '@/pages/Products/components/productDrawer/productDrawerUtils';
import { useTechCard } from '../useTechCards';
import { TechCardDocument, TechCardMeta } from './TechCardDocument';

interface TechCardDrawerProps {
  goodId: string | null;
  onClose: () => void;
  /** Рівень вкладеності (0 – поверх сторінки; над карткою товару – її stackLevel + 1) */
  stackLevel?: number;
}

/** Техкарта в Drawer (кнопка «Техкарта» в картці товару). Той самий документ, що й на сторінці. */
export function TechCardDrawer({ goodId, onClose, stackLevel = 0 }: TechCardDrawerProps) {
  const { data, loading, error } = useTechCard(goodId);
  const z = NESTED_DRAWER_Z[Math.min(stackLevel, NESTED_DRAWER_Z.length - 1)] || undefined;

  return (
    <Drawer
      isOpen={goodId != null}
      onClose={onClose}
      size="4xl"
      placement={window.innerWidth < 768 ? 'bottom' : 'right'}
      classNames={{
        wrapper: z,
        backdrop: [z, stackLevel > 0 ? 'bg-overlay/20' : ''].filter(Boolean).join(' ') || undefined,
        base: 'rounded-t-lg md:rounded-l-xl overflow-hidden flex flex-col max-h-[calc(100%-0.5rem)] md:max-h-full',
        header: 'shrink-0 flex flex-col gap-2 border-b border-default-200/60 py-3 md:py-4 px-3 md:px-6',
        body: 'px-3 md:px-6 py-4 flex-1 min-h-0 overflow-y-auto',
        closeButton: 'absolute top-2 md:top-3 z-20',
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-2 pr-8">
            <span className="text-lg font-semibold truncate">
              Техкарта{data ? ` «${data.good.name}»` : ''}
            </span>
            {goodId && (
              <Button
                as="a"
                href={`/production/techcards/${encodeURIComponent(goodId)}`}
                target="_blank"
                rel="noreferrer"
                size="sm"
                variant="light"
                isIconOnly
                aria-label="Відкрити техкарту окремою сторінкою"
                title="Відкрити окремою сторінкою"
              >
                <DynamicIcon name="external-link" size={16} />
              </Button>
            )}
          </div>
          {data && <TechCardMeta data={data} />}
        </DrawerHeader>
        <DrawerBody>
          {loading && (
            <div className="flex items-center justify-center h-40">
              <Spinner size="sm" />
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          {data && <TechCardDocument data={data} />}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
