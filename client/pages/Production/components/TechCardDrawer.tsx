import { useState } from 'react';
import { Button, Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { NESTED_DRAWER_Z, NESTED_OVERLAY_Z } from '@/pages/Products/components/productDrawer/productDrawerUtils';
import { useTechCard } from '../useTechCards';
import { TechCardDocument, TechCardDrawerTabs, TechCardMeta, type TechCardTabKey } from './TechCardDocument';

/** Каскад над карткою товару – удвічі менший, ніж у вкладених карток товару (`NESTED_DRAWER_MAX_W`). */
const TECH_CARD_DRAWER_MAX_W = [
  '',
  'max-h-[calc(100dvh-0.5rem)] top-2 md:max-w-[calc(var(--container-4xl)-1rem)]',
  'max-h-[calc(100dvh-0.75rem)] top-3 md:max-w-[calc(var(--container-4xl)-2rem)]',
  'max-h-[calc(100dvh-1rem)] top-4 md:max-w-[calc(var(--container-4xl)-3rem)]',
  'max-h-[calc(100dvh-1.25rem)] top-5 md:max-w-[calc(var(--container-4xl)-4rem)]',
] as const;

interface TechCardDrawerProps {
  goodId: string | null;
  onClose: () => void;
  /** Рівень вкладеності (0 – поверх сторінки; над карткою товару – її stackLevel + 1) */
  stackLevel?: number;
}

/**
 * Техкарта в Drawer (кнопка «Техкарта» в картці товару). Той самий документ, що й на сторінці:
 * вкладки – у шапці, панель дій – у футері; над карткою товару Drawer вужчий (видно каскад).
 */
export function TechCardDrawer({ goodId, onClose, stackLevel = 0 }: TechCardDrawerProps) {
  const { data, loading, error } = useTechCard(goodId);
  const [tab, setTab] = useState<TechCardTabKey>('card');
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const level = Math.min(stackLevel, NESTED_DRAWER_Z.length - 1);
  const z = NESTED_DRAWER_Z[level] || undefined;
  const nestedWidth =
    stackLevel > 0 ? TECH_CARD_DRAWER_MAX_W[Math.min(stackLevel, TECH_CARD_DRAWER_MAX_W.length - 1)] : '';

  return (
    <Drawer
      isOpen={goodId != null}
      onClose={onClose}
      size="4xl"
      placement={window.innerWidth < 768 ? 'bottom' : 'right'}
      classNames={{
        wrapper: z,
        backdrop: [z, stackLevel > 0 ? 'bg-overlay/20' : ''].filter(Boolean).join(' ') || undefined,
        base: [
          'rounded-t-lg md:rounded-l-xl overflow-hidden flex flex-col max-h-[calc(100%-0.5rem)] md:max-h-full',
          stackLevel > 0 ? `${nestedWidth} rounded-t-lg md:top-0 md:rounded-t-none md:max-h-full shadow-2xl` : '',
        ].join(' '),
        header: 'shrink-0 flex flex-col gap-2 border-b border-default-200/60 py-3 px-3 md:px-4',
        body: 'px-3 md:px-4 pb-4 flex-1 min-h-0 overflow-y-auto',
        footer: 'shrink-0 border-t border-default-200/60 bg-content2/75 px-3 md:px-4 py-3 has-[>div:empty]:hidden',
        closeButton: 'absolute top-2 md:top-3 z-20',
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-2 pr-8">
            <span className="truncate text-lg font-semibold">Техкарта{data ? ` «${data.good.name}»` : ''}</span>
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
                <DynamicIcon name="external-link" size={15} />
              </Button>
            )}
          </div>
          {data && <TechCardMeta data={data} />}
          <TechCardDrawerTabs tab={tab} onChange={setTab} />
        </DrawerHeader>
        <DrawerBody>
          {loading && (
            <div className="flex items-center justify-center h-40">
              <Spinner size="sm" />
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          {data && (
            <TechCardDocument
              data={data}
              context="drawer"
              tab={tab}
              footerTarget={footerEl}
              overlayZ={NESTED_OVERLAY_Z[Math.min(stackLevel, NESTED_OVERLAY_Z.length - 1)]}
            />
          )}
        </DrawerBody>
        <DrawerFooter>
          <div ref={setFooterEl} className="w-full empty:hidden" />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
