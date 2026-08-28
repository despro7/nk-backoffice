import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { useTouchUi } from '@/hooks/useTouchUi';
import { DOCK_PLACEMENT_CLASS } from './presets';
import type { ActionBubbleDockProps, ActionBubbleOffset, ActionBubblePlacement } from './types';

interface ActionBubbleDockContextValue {
  panelEl: HTMLDivElement | null;
  buttonsEl: HTMLDivElement | null;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

const ActionBubbleDockContext = createContext<ActionBubbleDockContextValue | null>(null);

export function useActionBubbleDock(): ActionBubbleDockContextValue | null {
  return useContext(ActionBubbleDockContext);
}

export function ActionBubbleDock({
  children,
  placement = 'bottom-end',
  offset,
  className,
  visible,
}: ActionBubbleDockProps) {
  const touchUi = useTouchUi();
  const isVisible = visible ?? touchUi;
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const [buttonsEl, setButtonsEl] = useState<HTMLDivElement | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const isTop = placement.startsWith('top');
  const alignEnd = placement.endsWith('end');

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
  }, []);

  const value = useMemo<ActionBubbleDockContextValue>(
    () => ({ panelEl, buttonsEl, activeId, setActiveId }),
    [panelEl, buttonsEl, activeId, setActiveId]
  );

  if (!isVisible) return null;

  return (
    <ActionBubbleDockContext.Provider value={value}>
      <div
        className={cn(
          'fixed z-50 flex gap-3',
          isTop ? 'flex-col-reverse' : 'flex-col',
          DOCK_PLACEMENT_CLASS[placement as ActionBubblePlacement],
          className
        )}
        style={offsetStyle(offset)}
      >
        <div
          ref={setPanelEl}
          className={cn('flex flex-col', alignEnd ? 'items-end' : 'items-start')}
        />
        <div
          ref={setButtonsEl}
          className={cn(
            'flex items-end gap-2',
            alignEnd ? 'flex-row' : 'flex-row-reverse'
          )}
        />
      </div>
      {children}
    </ActionBubbleDockContext.Provider>
  );
}

export function offsetStyle(
  offset: ActionBubbleOffset | undefined
): { transform?: string } | undefined {
  if (!offset) return undefined;
  const x = offset.x ?? 0;
  const y = offset.y ?? 0;
  if (x === 0 && y === 0) return undefined;
  return { transform: `translate(${x}px, ${y}px)` };
}
