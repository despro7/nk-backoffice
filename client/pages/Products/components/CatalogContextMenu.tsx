import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CATALOG_ACTIONS_MENU_PANEL,
  CatalogActionsMenuItems,
} from './CatalogActionsMenu';

export interface CatalogContextMenuState {
  x: number;
  y: number;
  ids: string[];
  /** true = ПКМ по елементу зі смітника */
  fromTrash?: boolean;
  /** true = ПКМ по елементу з архіву (також у пошуку) */
  fromArchive?: boolean;
  /** Усі обрані елементи — групи/папки */
  groupsOnly?: boolean;
}

interface CatalogContextMenuProps {
  state: CatalogContextMenuState | null;
  busy?: boolean;
  /** Fallback: ПКМ зсередини архівної папки */
  isInsideArchive?: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onSyncFromDilovod: (ids: string[]) => void;
  onLegacyUpdate: (ids: string[]) => void;
  onMoveTo: (ids: string[]) => void;
  onChangeType: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onArchive: (ids: string[]) => void;
  onRestore: (ids: string[]) => void;
  onTrash: (ids: string[]) => void;
  /** Відновити зі смітника (вибір папки) */
  onRestoreFromTrash: (ids: string[]) => void;
}

export function CatalogContextMenu({
  state,
  busy,
  isInsideArchive,
  onClose,
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
}: CatalogContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state?.x ?? 0, y: state?.y ?? 0 });

  useLayoutEffect(() => {
    if (!state) return;
    setPos({ x: state.x, y: state.y });
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      x: Math.max(pad, Math.min(state.x, window.innerWidth - rect.width - pad)),
      y: Math.max(pad, Math.min(state.y, window.innerHeight - rect.height - pad)),
    });
  }, [state]);

  useEffect(() => {
    if (!state) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onScroll = () => onClose();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [state, onClose]);

  if (!state) return null;

  const fromTrash = Boolean(state.fromTrash);
  const fromArchive = Boolean(state.fromArchive) || (Boolean(isInsideArchive) && !fromTrash);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Дії з елементами каталогу"
      className={`fixed z-[100] ${CATALOG_ACTIONS_MENU_PANEL}`}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CatalogActionsMenuItems
        ids={state.ids}
        busy={busy}
        fromTrash={fromTrash}
        fromArchive={fromArchive}
        groupsOnly={state.groupsOnly}
        onEdit={onEdit}
        onSyncFromDilovod={onSyncFromDilovod}
        onLegacyUpdate={onLegacyUpdate}
        onMoveTo={onMoveTo}
        onChangeType={onChangeType}
        onDuplicate={onDuplicate}
        onArchive={onArchive}
        onRestore={onRestore}
        onTrash={onTrash}
        onRestoreFromTrash={onRestoreFromTrash}
        onClose={onClose}
      />
    </div>,
    document.body
  );
}
