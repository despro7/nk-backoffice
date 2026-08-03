import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogTreeItemData } from '../ProductsTypes';
import { CATALOG_ROOT_ID } from '../ProductsTypes';
import {
  getBlockedMoveTargetIds,
  isArchiveFolderId,
  isArchiveFolderName,
  type CatalogItemLabel,
} from '../ProductsUtils';
import { CatalogConfirmItemsList } from './CatalogConfirmItemsList';

interface MoveToFolderModalProps {
  isOpen: boolean;
  items: CatalogItemLabel[];
  treeItems: Record<string, CatalogTreeItemData>;
  loading?: boolean;
  /** Режим відновлення зі смітника (тексти кнопок) */
  isRestore?: boolean;
  onConfirm: (targetParentId: string) => void;
  onClose: () => void;
}

interface PickerNodeProps {
  id: string;
  treeItems: Record<string, CatalogTreeItemData>;
  selectedId: string | null;
  blockedIds: Set<string>;
  expandedIds: Set<string>;
  showChildGuides?: boolean;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
}

function PickerNode({
  id,
  treeItems,
  selectedId,
  blockedIds,
  expandedIds,
  showChildGuides = true,
  onToggleExpand,
  onSelect,
}: PickerNodeProps) {
  const data = treeItems[id];
  if (!data) return null;

  const isActive = selectedId === id;
  const isBlocked = blockedIds.has(id);
  const isArchive = isArchiveFolderName(data.name);
  const childIds = data.children;
  const hasChildren = childIds.length > 0;
  const isExpanded = expandedIds.has(id);

  const folderIcon = isArchive ? 'archive' : undefined;

  return (
    <li className="list-none">
      <button
        type="button"
        disabled={isBlocked}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          const clickedChevron = Boolean(
            (e.target as HTMLElement | null)?.closest?.('[data-tree-chevron]')
          );

          if (clickedChevron) {
            if (hasChildren) onToggleExpand(id);
            return;
          }

          if (isBlocked) return;

          if (hasChildren && !isExpanded) {
            onToggleExpand(id);
          }

          onSelect(id);
        }}
        className={[
          'flex w-full items-center gap-1.5 rounded-sm p-2 my-0.5 text-left text-sm transition-colors',
          isBlocked
            ? 'cursor-not-allowed text-default-300 opacity-50'
            : isActive
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-primary/5',
          data.delMark && !isBlocked ? 'opacity-60' : '',
        ].join(' ')}
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
                'pointer-events-none transition-transform duration-200',
                isArchive ? 'text-warning' : 'text-default-500',
                isExpanded ? '' : '-rotate-90',
              ].join(' ')}
            />
          </span>
        ) : (
          <span className="inline-block w-4 shrink-0" aria-hidden />
        )}
        {folderIcon && (
          <DynamicIcon
            name={folderIcon}
            size={16}
            className={`shrink-0 ${
              isArchive
                ? 'text-warning'
                : isActive
                  ? 'text-primary'
                  : 'text-default-500'
            }`}
          />
        )}
        <span className="truncate">{data.name}</span>
      </button>

      {hasChildren && (
        <div
          className={[
            'grid transition-[grid-template-rows] duration-200 ease-out',
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] pointer-events-none',
          ].join(' ')}
          aria-hidden={!isExpanded}
        >
          <ul
            role="group"
            className={[
              'relative min-h-0 list-none overflow-hidden',
              showChildGuides
                ? 'border-l-1 border-default-300 ml-4 pl-3.5'
                : 'pl-0',
            ].join(' ')}
          >
            {childIds.map((childId) => (
              <PickerNode
                key={childId}
                id={childId}
                treeItems={treeItems}
                selectedId={selectedId}
                blockedIds={blockedIds}
                expandedIds={expandedIds}
                showChildGuides
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function MoveToFolderModal({
  isOpen,
  items,
  treeItems,
  loading,
  isRestore = false,
  onConfirm,
  onClose,
}: MoveToFolderModalProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const moveIds = useMemo(() => items.map((i) => i.id), [items]);
  const blockedIds = useMemo(() => {
    const blocked = getBlockedMoveTargetIds(moveIds, treeItems);
    // Корінь каталогу недоступний для move/restore
    blocked.add(CATALOG_ROOT_ID);
    return blocked;
  }, [moveIds, treeItems]);

  const rootChildren = treeItems[CATALOG_ROOT_ID]?.children ?? [];

  useEffect(() => {
    if (!isOpen) return;
    setTargetId(null);
    setExpandedIds(new Set());
  }, [isOpen]);

  const targetName = treeItems[targetId || '']?.name || null;

  const targetIsArchive = Boolean(
    targetId && isArchiveFolderId(targetId, treeItems)
  );

  const canConfirm =
    Boolean(targetId) &&
    targetId !== CATALOG_ROOT_ID &&
    !loading &&
    !blockedIds.has(targetId || '');

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      scrollBehavior="inside"
      classNames={{
        base: 'max-h-[85vh]',
        body: 'py-3',
      }}
    >
      <ModalContent>
        <ModalHeader>{isRestore ? 'Відновити в…' : 'Перемістити в…'}</ModalHeader>
        <ModalBody className="gap-3">
          <p className="text-sm text-default-600">
            Оберіть цільову папку для {items.length} елемент(ів)
            {targetName ? (
              <>
                {' '}
                → «{targetName}»
              </>
            ) : null}
            .
            {targetIsArchive ? ' Ціль — архівна папка.' : ''}
          </p>
          <CatalogConfirmItemsList items={items} />
          <div className="max-h-[min(420px,50vh)] overflow-auto rounded-lg border border-default-200 p-2">
            {rootChildren.length === 0 ? (
              <p className="px-2 py-4 text-sm text-default-400">Немає доступних папок</p>
            ) : (
              <ul role="tree" className="m-0 list-none p-0" aria-label="Вибір папки">
                {rootChildren.map((childId) => (
                  <PickerNode
                    key={childId}
                    id={childId}
                    treeItems={treeItems}
                    selectedId={targetId}
                    blockedIds={blockedIds}
                    expandedIds={expandedIds}
                    showChildGuides
                    onToggleExpand={toggleExpand}
                    onSelect={setTargetId}
                  />
                ))}
              </ul>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={loading}>
            Скасувати
          </Button>
          <Button
            color="primary"
            isDisabled={!canConfirm}
            isLoading={loading}
            onPress={() => {
              if (!targetId || targetId === CATALOG_ROOT_ID || blockedIds.has(targetId)) {
                return;
              }
              onConfirm(targetId);
            }}
          >
            {isRestore ? 'Відновити' : 'Перемістити'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
