import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { drawerStackClassNames } from '@/lib/drawerStacking';
import {
  useResizableDrawerWidth,
  type ResizableDrawerPlacement,
} from '@/hooks/useResizableDrawerWidth';

export interface ResizableAppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  titleExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Початкова сторона (можна перемикати в UI). */
  initialPlacement?: ResizableDrawerPlacement;
  /** Початковий pin; можна перемикати в UI. */
  initialNonDismissable?: boolean;
  showPinToggle?: boolean;
  showPlacementToggle?: boolean;
  resizable?: boolean;
  widthStorageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  stackLevel?: number;
  resizeAriaLabel?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

const DEFAULT_WIDTH = 840;
const DEFAULT_MIN = 622;
const DEFAULT_MAX = 1024;
const DEFAULT_WIDTH_KEY = 'resizable-app-drawer-width-v1';

export default function ResizableAppDrawer({
  isOpen,
  onClose,
  title,
  titleExtra,
  children,
  footer,
  initialPlacement = 'right',
  initialNonDismissable = false,
  showPinToggle = true,
  showPlacementToggle = true,
  resizable = true,
  widthStorageKey = DEFAULT_WIDTH_KEY,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = DEFAULT_MIN,
  maxWidth = DEFAULT_MAX,
  stackLevel = 0,
  resizeAriaLabel = 'Змінити ширину панелі',
  headerClassName,
  bodyClassName,
  footerClassName,
}: ResizableAppDrawerProps) {
  const [activePlacement, setActivePlacement] = useState<ResizableDrawerPlacement>(initialPlacement);
  const [activeNonDismissable, setActiveNonDismissable] = useState(initialNonDismissable);

  useEffect(() => {
    if (!isOpen) return;
    setActivePlacement(initialPlacement);
    setActiveNonDismissable(initialNonDismissable);
  }, [isOpen, initialPlacement, initialNonDismissable]);

  const {
    width: drawerWidth,
    isResizing,
    minWidth: resolvedMin,
    maxWidth: resolvedMax,
    onResizePointerDown,
  } = useResizableDrawerWidth({
    storageKey: widthStorageKey,
    defaultWidth,
    minWidth,
    maxWidth,
    placement: activePlacement,
  });

  const stackClasses = drawerStackClassNames(stackLevel);

  const pinTooltip = activeNonDismissable
    ? 'Відкріпити: закривати кліком зовні, блокувати фон'
    : 'Закріпити: фон інтерактивний, не закривати кліком зовні';
  const sideTooltip = activePlacement === 'right'
    ? 'Перемістити ліворуч'
    : 'Перемістити праворуч';

  const showToolbar = showPinToggle || showPlacementToggle;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      placement={activePlacement}
      size="full"
      backdrop={activeNonDismissable ? 'transparent' : 'opaque'}
      isDismissable={!activeNonDismissable}
      isKeyboardDismissDisabled={activeNonDismissable}
      shouldBlockScroll={!activeNonDismissable}
      style={{
        width: drawerWidth,
        minWidth: resolvedMin,
        maxWidth: drawerWidth,
      }}
      classNames={{
        wrapper: cn(
          activeNonDismissable ? 'pointer-events-none' : undefined,
          stackClasses.wrapper,
        ),
        backdrop: stackClasses.backdrop,
        base: cn(
          'flex flex-col !max-w-none',
          activeNonDismissable && 'pointer-events-auto',
          isResizing && 'select-none',
        ),
        body: 'flex-1 min-h-0 overflow-y-auto',
        closeButton: 'top-3 right-3',
      }}
    >
      <DrawerContent>
        {resizable ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={resizeAriaLabel}
            aria-valuemin={resolvedMin}
            aria-valuemax={resolvedMax}
            aria-valuenow={drawerWidth}
            className={cn(
              'absolute top-0 bottom-0 z-50 w-1.5 cursor-col-resize touch-none transition-colors',
              'hover:bg-primary/25 active:bg-primary/40',
              isResizing && 'bg-primary/35',
              activePlacement === 'right' ? 'left-0' : 'right-0',
            )}
            onPointerDown={onResizePointerDown}
          />
        ) : null}
        {showToolbar ? (
          <div className="absolute top-3 right-11 z-50 items-center gap-0.5 hidden md:flex">
            {showPinToggle ? (
              <Tooltip content={pinTooltip} placement="bottom" color="secondary">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label={pinTooltip}
                  aria-pressed={activeNonDismissable}
                  className="min-w-8 w-8 h-8 text-default-500"
                  onPress={() => setActiveNonDismissable((value) => !value)}
                >
                  <DynamicIcon name={activeNonDismissable ? 'pin' : 'pin-off'} size={16} />
                </Button>
              </Tooltip>
            ) : null}
            {showPlacementToggle ? (
              <Tooltip content={sideTooltip} placement="bottom" color="secondary">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label={sideTooltip}
                  className="min-w-8 w-8 h-8 text-default-500"
                  onPress={() => setActivePlacement((value) => (value === 'right' ? 'left' : 'right'))}
                >
                  <DynamicIcon
                    name={activePlacement === 'right' ? 'arrow-left-to-line' : 'arrow-right-to-line'}
                    size={16}
                  />
                </Button>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
        <DrawerHeader
          className={cn(
            'border-b border-default-200 shrink-0 flex flex-col items-start gap-1',
            showToolbar ? 'pr-28' : 'pr-12',
            headerClassName,
          )}
        >
          <div className="text-sm md:text-base font-semibold">{title}</div>
          {titleExtra}
        </DrawerHeader>

        <DrawerBody className={cn('flex flex-col gap-4 py-4 overflow-y-auto min-h-0 scrollbar-thin-transparent', bodyClassName)}>
          {children}
        </DrawerBody>

        {footer != null ? (
          <DrawerFooter className={cn('border-t border-default-200 shrink-0 gap-2', footerClassName)}>
            {footer}
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
