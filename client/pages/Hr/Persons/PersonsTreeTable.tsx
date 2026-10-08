import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Spinner, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { MiniConfirmPopover } from '@/components/ui/MiniConfirmPopover';
import { FormattedPhone } from '@/components/FormattedPhone';
import { HR_TABLE_CLASS_NAMES } from '../hrUi';
import { PersonDismissedStatusConflictIndicator } from '@/components/hr/PersonDismissedStatusConflictIndicator';
import { PersonEmploymentStatusChip } from '@/components/hr/PersonEmploymentStatusChip';
import { OUT_OF_GROUP_NODE_ID } from '@shared/utils/dilovodPersonGroups';
import type { HrPersonDto, HrPersonTreeNode } from '@shared/types/hr';
import type { PersonsContextMenuTarget } from './PersonsContextMenu';
import { buildPersonTreeChildrenMap } from '@shared/utils/personTreeOrder';
import {
  applyCatalogDropAttrs,
  catalogDragPreviewOffset,
  clearCatalogDropAttrs,
  collectCatalogHitRects,
  createCatalogLiveDragPreview,
  dismissCatalogDragPreview,
  hitCatalogRect,
  markCatalogDndSources,
  moveCatalogDragPreview,
  setCatalogDndCursor,
  snapBackCatalogDragPreview,
} from '@/pages/Products/ProductsUtils';

interface PersonsTreeTableProps {
  nodes: HrPersonTreeNode[];
  loading: boolean;
  canManage: boolean;
  isSearchMode: boolean;
  searchShowAllFolders: boolean;
  onToggleSearchShowAllFolders?: () => void;
  expandedIds: Set<string>;
  duplicatesOnly: boolean;
  onToggleExpanded: (nodeId: string) => void;
  onCollapseAll?: (rootId: string) => void;
  onEditPerson: (person: HrPersonDto) => void;
  onMergePerson?: (person: HrPersonDto) => void;
  onMovePerson?: (person: HrPersonDto, targetGroupId: string) => void;
  onContextMenu?: (event: React.MouseEvent, target: PersonsContextMenuTarget) => void;
  onDeleteEmptyGroup?: (legalEntityId: number, label: string) => void;
  deletingGroupLegalEntityId?: number | null;
}

type DropHint = { kind: 'into'; id: string };

interface DragPayload {
  personId: number;
  rowId: string;
  label: string;
}

function DuplicateIndicator({ person }: { person: HrPersonDto }) {
  if (!person.hasUnresolvedDuplicates) return null;
  return (
    <Tooltip
      content="Можливий дублікат"
      placement="top"
      showArrow
      classNames={{
        base: 'before:bg-amber-600 before:rounded-[2px]',
        content: 'bg-amber-600 border-0 text-white text-xs',
      }}
    >
      <span className="inline-flex shrink-0 text-amber-500">
        <DynamicIcon name="triangle-alert" size={14} />
      </span>
    </Tooltip>
  );
}

function resolveDropGroupId(node: HrPersonTreeNode): string | null {
  if (node.kind !== 'group' || !node.groupId) return null;
  return node.groupId;
}

function PersonTreeGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <span className="flex shrink-0 self-stretch items-stretch" aria-hidden>
      {Array.from({ length: depth }, (_, index) => (
        <span
          key={index}
          className="box-border w-4 shrink-0 border-r border-default-200"
        />
      ))}
    </span>
  );
}

function EmptyCellValue({ value }: { value: string | null | undefined }) {
  if (!value?.trim()) {
    return <span className="text-gray-300">—</span>;
  }
  return <span>{value}</span>;
}

function TableColGroup({ canManage }: { canManage: boolean }) {
  return (
    <colgroup>
      <col style={{ width: '30%' }} />
      <col />
      <col />
      <col />
      <col style={{ width: '120px' }} />
      {canManage ? <col style={{ width: '96px' }} /> : null}
    </colgroup>
  );
}

export function PersonsTreeTable({
  nodes,
  loading,
  canManage,
  isSearchMode,
  searchShowAllFolders,
  onToggleSearchShowAllFolders,
  expandedIds,
  duplicatesOnly,
  onToggleExpanded,
  onCollapseAll,
  onEditPerson,
  onMergePerson,
  onMovePerson,
  onContextMenu,
  onDeleteEmptyGroup,
  deletingGroupLegalEntityId = null,
}: PersonsTreeTableProps) {
  const canMove = Boolean(canManage && onMovePerson);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const dropHintRef = useRef<DropHint | null>(null);
  dropHintRef.current = dropHint;
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const pointerDndRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    sourceRowId: string;
    pointerType: string;
    captureEl: HTMLElement | null;
  } | null>(null);
  const onMovePersonRef = useRef(onMovePerson);
  onMovePersonRef.current = onMovePerson;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const childrenByParent = useMemo(() => buildPersonTreeChildrenMap(nodes), [nodes]);

  useEffect(() => {
    if (!canMove) return;

    const POINTER_THRESHOLD_MOUSE = 6;
    const POINTER_THRESHOLD_TOUCH = 10;

    let rowRects = collectCatalogHitRects('[data-catalog-row-id]');
    let folderRects = collectCatalogHitRects('[data-catalog-folder-id]');
    let raf = 0;
    let lastPtr: PointerEvent | null = null;

    const refreshHits = () => {
      rowRects = collectCatalogHitRects('[data-catalog-row-id]');
      folderRects = collectCatalogHitRects('[data-catalog-folder-id]');
    };

    const resolveHint = (clientX: number, clientY: number, sourceRowId: string): DropHint | null => {
      const folderHit = hitCatalogRect(folderRects, clientX, clientY, 'xy');
      if (!folderHit || folderHit.id === sourceRowId) return null;
      const targetNode = nodesRef.current.find((node) => (
        node.kind === 'group' && (node.groupId === folderHit.id || node.id === `group:${folderHit.id}`)
      ));
      if (!targetNode || targetNode.id === `group:${OUT_OF_GROUP_NODE_ID}`) return null;
      const groupId = resolveDropGroupId(targetNode);
      if (!groupId) return null;
      return { kind: 'into', id: groupId };
    };

    const applyHintFromPoint = (clientX: number, clientY: number, sourceRowId: string) => {
      const folderHit = hitCatalogRect(folderRects, clientX, clientY, 'xy');
      const hint = resolveHint(clientX, clientY, sourceRowId);
      dropHintRef.current = hint;
      setDropHint(hint);
      applyCatalogDropAttrs(hint, folderHit?.el ?? null);
    };

    const processMove = (e: PointerEvent) => {
      const session = pointerDndRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
      const threshold = session.pointerType === 'touch' || session.pointerType === 'pen'
        ? POINTER_THRESHOLD_TOUCH
        : POINTER_THRESHOLD_MOUSE;

      if (!session.active) {
        if (dist < threshold) return;
        session.active = true;
        const payload = dragPayloadRef.current;
        if (payload) {
          markCatalogDndSources([payload.rowId]);
          setDraggingRowId(payload.rowId);
          createCatalogLiveDragPreview(payload.label);
          setCatalogDndCursor(true);
          refreshHits();
        }
      }

      e.preventDefault();
      const offset = catalogDragPreviewOffset(session.pointerType);
      moveCatalogDragPreview(e.clientX + offset.x, e.clientY + offset.y);
      applyHintFromPoint(e.clientX, e.clientY, session.sourceRowId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const session = pointerDndRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      lastPtr = e;
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (lastPtr) processMove(lastPtr);
      });
    };

    const releaseCapture = (session: { pointerId: number; captureEl: HTMLElement | null }) => {
      if (!session.captureEl) return;
      try {
        if (session.captureEl.hasPointerCapture(session.pointerId)) {
          session.captureEl.releasePointerCapture(session.pointerId);
        }
      } catch {
        // ignore
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const session = pointerDndRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      if (lastPtr && session.active) processMove(lastPtr);
      lastPtr = null;
      releaseCapture(session);
      pointerDndRef.current = null;

      if (!session.active) {
        dragPayloadRef.current = null;
        clearCatalogDropAttrs();
        return;
      }

      applyHintFromPoint(e.clientX, e.clientY, session.sourceRowId);
      const hint = dropHintRef.current;
      const payload = dragPayloadRef.current;
      let didAction = false;

      if (hint?.kind === 'into' && payload && onMovePersonRef.current) {
        const person = nodesRef.current.find((node) => node.id === payload.rowId)?.person;
        if (person && person.dilovodParentId !== hint.id) {
          onMovePersonRef.current(person, hint.id);
          didAction = true;
        }
      }

      dropHintRef.current = null;
      setDropHint(null);
      clearCatalogDropAttrs();
      markCatalogDndSources([]);
      setCatalogDndCursor(false);
      dragPayloadRef.current = null;

      void (async () => {
        if (!didAction) {
          const sourceEl = document.querySelector(
            `[data-catalog-row-id="${CSS.escape(session.sourceRowId)}"]`,
          );
          await snapBackCatalogDragPreview(sourceEl instanceof HTMLElement ? sourceEl : null);
        } else {
          await dismissCatalogDragPreview();
        }
        setDraggingRowId(null);
      })();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pointerDndRef.current?.active) return;
      e.preventDefault();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [canMove]);

  const startPersonDrag = (
    e: React.PointerEvent<HTMLElement>,
    person: HrPersonDto,
    rowId: string,
  ) => {
    if (!canMove) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const handleEl = e.currentTarget;
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragPayloadRef.current = {
      personId: person.id,
      rowId,
      label: person.displayName,
    };
    pointerDndRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      sourceRowId: rowId,
      pointerType: e.pointerType,
      captureEl: handleEl,
    };
  };

  if (loading && nodes.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="p-10 text-center">
        <DynamicIcon name="contact" size={28} className="mx-auto mb-2 text-default-500/50" />
        <p className="text-sm text-default-500">Немає записів</p>
      </div>
    );
  }

  const thClass = 'px-3 py-3 text-left text-xs font-semibold text-default-500 bg-default-200/60 first:rounded-s-md last:rounded-e-md';
  const tdClass = 'px-3 align-middle first:rounded-s-md last:rounded-e-md';
  const columnCount = canManage ? 6 : 5;

  const renderTreeBranch = (parentId: string | null): ReactNode => {
    const children = childrenByParent.get(parentId) ?? [];

    return children.map((node) => {
      if (node.kind === 'group') {
        const expanded = expandedIds.has(node.id);
        const isTopLevelRoot = node.parentId == null;
        const groupChildren = childrenByParent.get(node.id) ?? [];
        const hasChildren = groupChildren.length > 0;
        const showDropInto = dropHint?.kind === 'into' && dropHint.id === node.groupId;
        const folderDropId = node.groupId ?? node.id.replace(/^group:/, '');
        const showCollapseAll = isTopLevelRoot && !isSearchMode && expanded;
        const showSearchFoldersToggle = isTopLevelRoot && isSearchMode && hasChildren;
        const canDeleteEmptyGroup = Boolean(
          canManage
          && onDeleteEmptyGroup
          && node.legalEntityId
          && !node.isSystem
          && !hasChildren
          && (node.childCount ?? 0) === 0,
        );

        return (
          <Fragment key={node.id}>
            <tr
              className={[
                HR_TABLE_CLASS_NAMES.tr,
                showDropInto ? 'bg-amber-400/20' : '',
                onContextMenu && node.legalEntityId && !node.isSystem ? 'cursor-context-menu' : '',
              ].join(' ')}
              data-catalog-folder-id={folderDropId}
              data-catalog-drop-into={showDropInto ? '' : undefined}
              onContextMenu={(event) => {
                if (!onContextMenu || node.isSystem || !node.legalEntityId) return;
                event.preventDefault();
                onContextMenu(event, {
                  kind: 'group',
                  group: {
                    id: node.id,
                    label: node.label,
                    groupId: node.groupId,
                    legalEntityId: node.legalEntityId,
                    isSystem: node.isSystem,
                  },
                });
              }}
            >
              <td className={tdClass}>
                <div className="flex w-full min-w-0 items-stretch">
                  <PersonTreeGuides depth={node.depth} />
                  <button
                    type="button"
                    className={[
                      'flex min-w-0 h-10 flex-1 items-center gap-1.5 rounded-sm p-2 text-left transition-colors',
                      isTopLevelRoot ? 'font-semibold' : 'font-medium text-default-900',
                    ].join(' ')}
                    onClick={() => {
                      if (hasChildren) onToggleExpanded(node.id);
                    }}
                  >
                    {hasChildren ? (
                      <span
                        data-tree-chevron
                        aria-hidden
                        className="inline-flex shrink-0 rounded hover:bg-default-200/60"
                      >
                        <DynamicIcon
                          name="chevron-down"
                          size={16}
                          className={[
                            'pointer-events-none text-default-500 transition-transform duration-200',
                            expanded ? '' : '-rotate-90',
                          ].join(' ')}
                        />
                      </span>
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <DynamicIcon
                      name={hasChildren ? 'folder-open' : 'folder'}
                      size={16}
                      className={isTopLevelRoot ? 'shrink-0 text-primary' : 'shrink-0 text-default-500'}
                    />
                    <span className="truncate select-none">{node.label}</span>
                    {node.childCount != null ? (
                      <span className="shrink-0 tabular-nums text-[11px] font-normal leading-none text-default-400 bg-default-500/8 rounded px-1 py-1">
                        {node.childCount}
                      </span>
                    ) : null}
                    {showSearchFoldersToggle ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="ml-4 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-default-600 hover:bg-default-200/60"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleSearchShowAllFolders?.();
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleSearchShowAllFolders?.();
                        }}
                      >
                        <DynamicIcon
                          name={searchShowAllFolders ? 'folder-minus' : 'folder-tree'}
                          size={13}
                          className="shrink-0 text-default-500"
                        />
                        {searchShowAllFolders ? 'Приховати інші папки' : 'Показати всі папки'}
                      </span>
                    ) : null}
                    {showCollapseAll ? (
                      <Tooltip
                        content="Згорнути всі групи"
                        showArrow
                        classNames={{
                          base: 'before:bg-slate-600 before:rounded-[2px]',
                          content: 'bg-slate-600 border-0 text-white text-xs',
                        }}
                        delay={300}
                      >
                        <span
                          role="button"
                          tabIndex={0}
                          className="ml-4 inline-flex shrink-0 rounded p-1 text-default-600 hover:bg-default-200/60"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onCollapseAll?.(node.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            e.stopPropagation();
                            onCollapseAll?.(node.id);
                          }}
                        >
                          <DynamicIcon name="copy-minus" size={14} />
                        </span>
                      </Tooltip>
                    ) : null}
                  </button>
                </div>
              </td>
              <td className={tdClass} />
              <td className={tdClass} />
              <td className={tdClass} />
              <td className={tdClass} />
              {canManage ? (
                <td className={`${tdClass} text-right`}>
                  {canDeleteEmptyGroup && node.legalEntityId ? (
                    <div className="flex justify-end">
                      <MiniConfirmPopover
                        title="Видалити порожню папку?"
                        message={`Папку «${node.label}» буде видалено в Dilovod, звʼязок з роботодавцем скинеться.`}
                        confirmText="Видалити"
                        onConfirm={() => onDeleteEmptyGroup?.(node.legalEntityId!, node.label)}
                        trigger={(
                          <Button
                            size="sm"
                            variant="light"
                            isIconOnly
                            aria-label="Видалити порожню папку"
                            color="danger"
                            isDisabled={deletingGroupLegalEntityId != null}
                            isLoading={deletingGroupLegalEntityId === node.legalEntityId}
                          >
                            <DynamicIcon name="trash-2" size={16} />
                          </Button>
                        )}
                      />
                    </div>
                  ) : null}
                </td>
              ) : null}
            </tr>
            {hasChildren ? (
              <tr key={`${node.id}-children`}>
                <td colSpan={columnCount} className="p-0 border-none">
                  <div
                    className={[
                      'grid transition-[grid-template-rows] duration-200 ease-out',
                      expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] pointer-events-none',
                    ].join(' ')}
                    aria-hidden={!expanded}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <table className="w-full table-fixed border-collapse text-sm">
                        <TableColGroup canManage={canManage} />
                        <tbody>{renderTreeBranch(node.id)}</tbody>
                      </table>
                    </div>
                  </div>
                </td>
              </tr>
            ) : null}
          </Fragment>
        );
      }

      const person = node.person;
      if (!person) return null;

      const showDuplicateActions = duplicatesOnly || person.hasUnresolvedDuplicates;
      const isDragging = draggingRowId === node.id;
      const employerName = person.employerName || person.linkedEmployee?.currentLegalEntityName;

      return (
        <tr
          key={node.id}
          className={[
            HR_TABLE_CLASS_NAMES.tr,
            'group',
            isDragging ? 'opacity-35' : '',
            onContextMenu ? 'cursor-context-menu' : '',
          ].join(' ')}
          data-catalog-row-id={node.id}
          data-catalog-dnd-source={isDragging ? '' : undefined}
          onContextMenu={(event) => {
            if (!onContextMenu) return;
            event.preventDefault();
            onContextMenu(event, { kind: 'person', person });
          }}
        >
          <td className={tdClass}>
            <div className="flex min-w-0 items-center gap-2">
              <PersonTreeGuides depth={node.depth} />
              {canMove ? (
                <span
                  data-drag-handle
                  className={[
                    'mt-0.5 -mr-1 inline-flex h-8 w-5 shrink-0 touch-none items-center justify-center text-default-300 transition-opacity',
                    draggingRowId ? 'cursor-grabbing opacity-100' : 'cursor-grab opacity-0 group-hover:opacity-100',
                  ].join(' ')}
                  title="Перетягнути в іншу папку"
                  onPointerDown={(e) => startPersonDrag(e, person, node.id)}
                >
                  <DynamicIcon name="grip-vertical" size={14} />
                </span>
              ) : null}
              <button
                type="button"
                className="flex min-w-0 items-start gap-2 text-left py-3 hover:text-primary"
                onClick={() => onEditPerson(person)}
              >
                <DynamicIcon name="user" size={16} className="mt-0.5 shrink-0 text-default-400" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <DuplicateIndicator person={person} />
                    <PersonDismissedStatusConflictIndicator person={person} />
                    <span className="truncate font-medium text-default-900">{person.displayName}</span>
                  </span>
                </span>
              </button>
            </div>
          </td>
          <td className={`${tdClass} font-mono text-xs`}>
            <EmptyCellValue value={person.dilovodCode} />
          </td>
          <td className={tdClass}>
            <FormattedPhone
              phone={person.phone}
              style="national"
              className={person.phone?.trim() ? 'tabular-nums' : 'text-gray-300'}
            />
          </td>
          <td className={tdClass}>
            <EmptyCellValue value={employerName} />
          </td>
          <td className={tdClass}>
            <PersonEmploymentStatusChip person={person} rounded="sm" />
          </td>
          {canManage ? (
            <td className={`${tdClass} text-right`}>
              <div className="flex justify-end gap-0.5">
                {showDuplicateActions && onMergePerson ? (
                  <Tooltip content="Об'єднати особи" placement="top" showArrow>
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      aria-label="Об'єднати особи"
                      className="text-blue-500 hover:bg-blue-500/10!"
                      onPress={() => onMergePerson(person)}
                    >
                      <DynamicIcon name="merge" size={16} />
                    </Button>
                  </Tooltip>
                ) : null}
                <Tooltip content="Редагувати особу" placement="top-end" showArrow>
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    aria-label={`Редагувати ${person.displayName}`}
                    className="text-slate-700"
                    onPress={() => onEditPerson(person)}
                  >
                    <DynamicIcon name="pencil" size={16} />
                  </Button>
                </Tooltip>
              </div>
            </td>
          ) : null}
        </tr>
      );
    });
  };

  return (
    <div className={`${HR_TABLE_CLASS_NAMES.wrapper} overflow-x-auto`}>
      <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
        <TableColGroup canManage={canManage} />
        <thead>
          <tr>
            <th className={`${thClass} max-w-[30%]`}>Контрагент</th>
            <th className={`${thClass}`}>Код в Dilovod</th>
            <th className={`${thClass}`}>Телефон</th>
            <th className={`${thClass}`}>Роботодавець</th>
            <th className={`${thClass} w-[120px]`}>Статус</th>
            {canManage ? <th className={`${thClass} w-[96px] text-right pr-5`}>Дії</th> : null}
          </tr>
        </thead>
        <tbody>
          {renderTreeBranch(null)}
        </tbody>
      </table>
    </div>
  );
}
