import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { HrPersonDto } from '@shared/types/hr';

export interface PersonsContextMenuGroupTarget {
  id: string;
  label: string;
  groupId?: string;
  legalEntityId?: number;
  isSystem?: boolean;
}

export type PersonsContextMenuTarget =
  | { kind: 'person'; person: HrPersonDto }
  | { kind: 'group'; group: PersonsContextMenuGroupTarget };

export interface PersonsContextMenuState {
  x: number;
  y: number;
  target: PersonsContextMenuTarget;
}

interface PersonsContextMenuProps {
  state: PersonsContextMenuState | null;
  canManage: boolean;
  recordSyncing?: boolean;
  onClose: () => void;
  onEditPerson?: (person: HrPersonDto) => void;
  onMergePerson?: (person: HrPersonDto) => void;
  onSyncPerson?: (person: HrPersonDto) => void;
  onSyncGroup?: (group: PersonsContextMenuGroupTarget) => void;
  duplicatesOnly?: boolean;
}

const PANEL =
  'min-w-[220px] overflow-hidden rounded-lg border border-default-200 bg-content1 p-1.5 shadow-lg';

const ITEM =
  'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const SEPARATOR = 'my-1 h-px bg-default-200';

export function PersonsContextMenu({
  state,
  canManage,
  recordSyncing,
  onClose,
  onEditPerson,
  onMergePerson,
  onSyncPerson,
  onSyncGroup,
  duplicatesOnly,
}: PersonsContextMenuProps) {
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

  const target = state.target;
  const person = target.kind === 'person' ? target.person : null;
  const group = target.kind === 'group' ? target.group : null;

  const showMerge = Boolean(
    person
    && onMergePerson
    && (duplicatesOnly || person.hasUnresolvedDuplicates),
  );

  const showPersonSync = Boolean(canManage && person && onSyncPerson);
  const showGroupSync = Boolean(
    canManage
    && group
    && onSyncGroup
    && group.legalEntityId
    && !group.isSystem,
  );

  const personSyncLabel = person?.dilovodPersonId
    ? 'Завантажити контакт з Dilovod'
    : 'Відправити контакт у Dilovod';

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Дії з фізичними особами"
      className={`fixed z-[200] ${PANEL}`}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {person && onEditPerson ? (
        <button
          type="button"
          role="menuitem"
          className={`${ITEM} text-foreground hover:bg-default-100`}
          onClick={() => {
            onEditPerson(person);
            onClose();
          }}
        >
          <DynamicIcon name="pencil" size={16} className="shrink-0 text-default-500" />
          Редагувати особу
        </button>
      ) : null}
      {showMerge && person ? (
        <button
          type="button"
          role="menuitem"
          className={`${ITEM} text-foreground hover:bg-default-100`}
          onClick={() => {
            onMergePerson?.(person);
            onClose();
          }}
        >
          <DynamicIcon name="merge" size={16} className="shrink-0 text-blue-500" />
          Об&apos;єднати особи
        </button>
      ) : null}
      {showPersonSync && person ? (
        <>
          {onEditPerson || showMerge ? <div className={SEPARATOR} role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            disabled={recordSyncing}
            className={`${ITEM} text-foreground hover:bg-default-100`}
            onClick={() => {
              onSyncPerson?.(person);
              onClose();
            }}
          >
            <DynamicIcon
              name={person.dilovodPersonId ? 'cloud-download' : 'cloud-upload'}
              size={16}
              className={`shrink-0 text-default-500 ${recordSyncing ? 'animate-pulse' : ''}`}
            />
            {personSyncLabel}
          </button>
        </>
      ) : null}
      {showGroupSync && group ? (
        <button
          type="button"
          role="menuitem"
          disabled={recordSyncing}
          className={`${ITEM} text-foreground hover:bg-default-100`}
          onClick={() => {
            onSyncGroup?.(group);
            onClose();
          }}
        >
          <DynamicIcon
            name="folder-sync"
            size={16}
            className={`shrink-0 text-default-500 ${recordSyncing ? 'animate-pulse' : ''}`}
          />
          Синхронізувати папку з Dilovod
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
