import { useEffect, useMemo, useState } from 'react';
import { Checkbox, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  catalogFolderEditKey,
  catalogFolderViewKey,
  normalizeCatalogFolderId,
  resolveCatalogFolderAccess,
} from '@shared/utils/catalogFolderAccess';
import type { CatalogTreeNodeDto } from '@shared/types/catalog';

type FolderNode = CatalogTreeNodeDto & { children: FolderNode[] };

function buildForest(folders: CatalogTreeNodeDto[]): FolderNode[] {
  const byId = new Map<string, FolderNode>();
  for (const folder of folders) {
    byId.set(folder.id, { ...folder, children: [] });
  }
  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    const parentId = normalizeCatalogFolderId(node.parentId);
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (list: FolderNode[]) => {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'uk'));
    list.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

function collectDescendantIds(node: FolderNode): string[] {
  const ids: string[] = [];
  const walk = (n: FolderNode) => {
    for (const child of n.children) {
      ids.push(child.id);
      walk(child);
    }
  };
  walk(node);
  return ids;
}

function hasExplicitView(selected: Set<string>, id: string): boolean {
  return selected.has(catalogFolderViewKey(id)) || selected.has(catalogFolderEditKey(id));
}

function hasExplicitEdit(selected: Set<string>, id: string): boolean {
  return selected.has(catalogFolderEditKey(id));
}

export function CatalogFolderAclTree({
  selected,
  disabled,
  onChange,
}: {
  selected: Set<string>;
  disabled: boolean;
  onChange: (next: Set<string>) => void;
}) {
  const [folders, setFolders] = useState<CatalogTreeNodeDto[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const manageOn = selected.has(PERMISSIONS.ACTION_CATALOG_MANAGE);

  useEffect(() => {
    void fetch('/api/roles/catalog-folders', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : { folders: [] }))
      .then((data: { folders?: CatalogTreeNodeDto[] }) => {
        setFolders(Array.isArray(data.folders) ? data.folders : []);
      })
      .catch(() => setFolders([]));
  }, []);

  const forest = useMemo(() => buildForest(folders ?? []), [folders]);
  const parentById = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const folder of folders ?? []) {
      map[folder.id] = normalizeCatalogFolderId(folder.parentId);
    }
    return map;
  }, [folders]);

  const toggleManage = (value: boolean) => {
    if (disabled) return;
    const next = new Set(selected);
    if (value) next.add(PERMISSIONS.ACTION_CATALOG_MANAGE);
    else next.delete(PERMISSIONS.ACTION_CATALOG_MANAGE);
    onChange(next);
  };

  const setFolderGrant = (node: FolderNode, mode: 'view' | 'edit', value: boolean) => {
    if (disabled || manageOn) return;
    const next = new Set(selected);
    const viewKey = catalogFolderViewKey(node.id);
    const editKey = catalogFolderEditKey(node.id);
    const descendantIds = collectDescendantIds(node);

    if (mode === 'view') {
      if (value) {
        next.add(viewKey);
        for (const id of descendantIds) next.delete(catalogFolderViewKey(id));
      } else {
        next.delete(viewKey);
        next.delete(editKey);
        for (const id of descendantIds) {
          next.delete(catalogFolderViewKey(id));
          next.delete(catalogFolderEditKey(id));
        }
      }
    } else if (value) {
      next.add(viewKey);
      next.add(editKey);
      for (const id of descendantIds) {
        next.delete(catalogFolderViewKey(id));
        next.delete(catalogFolderEditKey(id));
      }
    } else {
      next.delete(editKey);
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-md font-bold text-gray-700">
        <DynamicIcon name="folder-tree" size={16} className="text-primary-500" />
        Розділи каталогу
      </h3>
      <p className="text-xs text-gray-500">
        Перегляд і редагування на папці діють на всю гілку. Повний доступ замінює окремі галочки.
      </p>
      <Checkbox
        isSelected={manageOn}
        isDisabled={disabled}
        onValueChange={toggleManage}
        classNames={{ label: 'font-medium text-sm' }}
      >
        Повний доступ до каталогу
      </Checkbox>
      {manageOn && (
        <p className="text-xs text-gray-400">Усі розділи відкриті для перегляду та редагування.</p>
      )}
      {folders == null ? (
        <div className="py-6 text-center">
          <Spinner size="sm" />
        </div>
      ) : (
        <div
          className={`rounded-lg border border-default-200 p-2 max-h-[420px] overflow-y-auto ${
            manageOn || disabled ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          <div className="grid grid-cols-[1fr_88px_110px] gap-1 px-2 pb-1 text-[11px] uppercase tracking-wide text-gray-400">
            <span>Папка</span>
            <span>Перегляд</span>
            <span>Редагування</span>
          </div>
          {forest.map((node) => (
            <FolderAclRow
              key={node.id}
              node={node}
              depth={0}
              selected={selected}
              parentById={parentById}
              expanded={expanded}
              onToggleExpand={(id) => {
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onGrant={setFolderGrant}
            />
          ))}
          {forest.length === 0 && (
            <p className="px-2 py-4 text-sm text-gray-400">Дерево каталогу порожнє.</p>
          )}
        </div>
      )}
    </div>
  );
}

function FolderAclRow({
  node,
  depth,
  selected,
  parentById,
  expanded,
  onToggleExpand,
  onGrant,
}: {
  node: FolderNode;
  depth: number;
  selected: Set<string>;
  parentById: Record<string, string | null>;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onGrant: (node: FolderNode, mode: 'view' | 'edit', value: boolean) => void;
}) {
  const access = resolveCatalogFolderAccess(selected, node.id, parentById);
  const parentAccess = resolveCatalogFolderAccess(
    selected,
    parentById[node.id] ?? null,
    parentById
  );
  const viewFromAncestor = parentAccess.view;
  const editFromAncestor = parentAccess.edit;
  const explicitView = hasExplicitView(selected, node.id);
  const explicitEdit = hasExplicitEdit(selected, node.id);
  const descendantHasView = node.children.some((child) => {
    const nested = resolveCatalogFolderAccess(selected, child.id, parentById);
    return nested.view;
  });
  const descendantHasEdit = node.children.some((child) => {
    const nested = resolveCatalogFolderAccess(selected, child.id, parentById);
    return nested.edit;
  });
  const viewIndeterminate =
    !access.view && descendantHasView && !explicitView && !viewFromAncestor;
  const editIndeterminate =
    !access.edit && descendantHasEdit && !explicitEdit && !editFromAncestor;
  const isOpen = expanded.has(node.id) || depth < 1;
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className="grid grid-cols-[1fr_88px_110px] items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-default-100/80"
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          className="flex min-w-0 items-center gap-1 text-left text-sm"
          onClick={() => hasChildren && onToggleExpand(node.id)}
        >
          {hasChildren ? (
            <DynamicIcon
              name="chevron-down"
              size={14}
              className={`shrink-0 text-default-400 transition-transform ${isOpen ? '' : '-rotate-90'}`}
            />
          ) : (
            <span className="inline-block w-3.5" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        <Checkbox
          size="sm"
          isSelected={access.view}
          isIndeterminate={viewIndeterminate}
          isDisabled={viewFromAncestor}
          onValueChange={(value) => onGrant(node, 'view', value)}
          aria-label={`Перегляд: ${node.name}`}
        />
        <Checkbox
          size="sm"
          isSelected={access.edit}
          isIndeterminate={editIndeterminate}
          isDisabled={editFromAncestor}
          onValueChange={(value) => onGrant(node, 'edit', value)}
          aria-label={`Редагування: ${node.name}`}
        />
      </div>
      {hasChildren && isOpen
        ? node.children.map((child) => (
            <FolderAclRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selected={selected}
              parentById={parentById}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onGrant={onGrant}
            />
          ))
        : null}
    </>
  );
}
