import { Fragment, useEffect, useMemo, useState } from 'react';
import { Checkbox, Spinner, Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { PERMISSIONS } from '@shared/constants/permissions';
import { HR_TABLE_CLASS_NAMES } from '@/pages/Hr/hrUi';
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

function CatalogTreeGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <span className="flex shrink-0 self-stretch items-stretch" aria-hidden>
      {Array.from({ length: depth }, (_, index) => (
        <span key={index} className="box-border w-4 shrink-0 border-r border-default-200 tree-guide" />
      ))}
    </span>
  );
}

const TH_CLASS = 'px-3 py-2.5 text-left text-xs font-semibold text-default-500 bg-default-200/75 backdrop-blur-sm first:rounded-s-sm last:rounded-e-sm sticky top-0 z-20';
const TD_CLASS = 'px-0 align-middle first:rounded-s-md last:rounded-e-md';

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

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderFolderNode = (node: FolderNode, depth: number): React.ReactNode => {
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
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const isTopLevel = depth === 0;

    return (
      <Fragment key={node.id}>
        <tr className={`${HR_TABLE_CLASS_NAMES.tr} last:[&>td_.tree-guide]:[mask-image:linear-gradient(to_bottom,black_calc(100%-30px),transparent)]`}>
          <td className={TD_CLASS}>
            <div className="flex w-full min-w-0 items-stretch">
              <CatalogTreeGuides depth={depth} />
              <button
                type="button"
                className={[
                  'flex min-w-0 h-10 flex-1 items-center gap-1.5 rounded-sm p-2 text-left transition-colors',
                  isTopLevel ? 'font-semibold text-default-900' : 'font-medium text-default-900',
                ].join(' ')}
                onClick={(e) => {
                  e.preventDefault();
                  if (hasChildren) toggleExpanded(node.id);
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
                        isOpen ? '' : '-rotate-90',
                      ].join(' ')}
                    />
                  </span>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <DynamicIcon
                  name={hasChildren ? 'folder-open' : 'folder'}
                  size={16}
                  className={isTopLevel ? 'shrink-0 text-primary' : 'shrink-0 text-default-500'}
                />
                <span className="truncate select-none">{node.name}</span>
              </button>
            </div>
          </td>
          <td className={`${TD_CLASS} text-center w-[88px]`}>
            <div className="flex justify-center">
              <Checkbox
                size="sm"
                isSelected={access.view}
                isIndeterminate={viewIndeterminate}
                isDisabled={viewFromAncestor}
                onValueChange={(value) => setFolderGrant(node, 'view', value)}
                aria-label={`Перегляд: ${node.name}`}
              />
            </div>
          </td>
          <td className={`${TD_CLASS} text-center w-[110px]`}>
            <div className="flex justify-center">
              <Checkbox
                size="sm"
                isSelected={access.edit}
                isIndeterminate={editIndeterminate}
                isDisabled={editFromAncestor}
                onValueChange={(value) => setFolderGrant(node, 'edit', value)}
                aria-label={`Редагування: ${node.name}`}
              />
            </div>
          </td>
        </tr>
        {hasChildren ? (
          <tr>
            <td colSpan={3} className="p-0 border-none">
              <div
                className={[
                  'grid transition-[grid-template-rows] duration-200 ease-out',
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] pointer-events-none',
                ].join(' ')}
                aria-hidden={!isOpen}
              >
                <div className="min-h-0 overflow-hidden">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                    <colgroup>
                      <col />
                      <col style={{ width: '88px' }} />
                      <col style={{ width: '110px' }} />
                    </colgroup>
                    <tbody>
                      {node.children.map((child) => renderFolderNode(child, depth + 1))}
                    </tbody>
                  </table>
                </div>
              </div>
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-default-900">
            <DynamicIcon name="folder-tree" size={14} className="text-default-500 shrink-0" />
            Розділи каталогу
          </h3>
          <p className="text-xs text-default-500 leading-relaxed pl-5">
            Перегляд і редагування на папці діють на всю гілку. Повний доступ замінює окремі галочки.
          </p>
        </div>
        <Switch
          isSelected={manageOn}
          onValueChange={toggleManage}
          aria-label="Повний доступ до каталогу"
          classNames={{
            base: [
              "inline-flex flex-row-reverse w-full max-w-md bg-content1 hover:bg-content2 items-center",
              "justify-between cursor-pointer rounded-lg gap-1 p-3 border-1",
              "data-[selected=true]:border-primary",
            ],
            wrapper: "p-0 h-4 overflow-visible",
            thumb: [
              "w-6 h-6 border-2 shadow-lg",
              "group-data-[hover=true]:border-primary",
              "group-data-[selected=true]:border-primary",
              //selected
              "group-data-[selected=true]:ms-6",
              // pressed
              "group-data-[pressed=true]:w-7",
              "group-data-pressed:group-data-selected:ms-4",
            ],
          }}
        >
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">Повний доступ до каталогу</p>
            <p className="text-xs text-default-400">
              Усі розділи відкриті для перегляду та редагування.
            </p>
          </div>
        </Switch>
      </div>
      
      {folders == null ? (
        <div className="py-6 text-center">
          <Spinner size="sm" />
        </div>
      ) : (
        <div
          className={`rounded-md border border-default-200 max-h-[420px] overflow-auto p-2 pr-1 scrollbar-thin-transparent ${
            manageOn || disabled ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          <div className={HR_TABLE_CLASS_NAMES.wrapper}>
            <table className="w-full min-w-[480px] table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                <col />
                <col style={{ width: '88px' }} />
                <col style={{ width: '110px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className={`${TH_CLASS}`}>Папка</th>
                  <th className={`${TH_CLASS} text-center`}>Перегляд</th>
                  <th className={`${TH_CLASS} text-center`}>Редагування</th>
                </tr>
              </thead>
              <tbody>
                {forest.map((node) => renderFolderNode(node, 0))}
              </tbody>
            </table>
          </div>
          {forest.length === 0 && (
            <p className="px-3 py-6 text-sm text-default-400 text-center">Дерево каталогу порожнє.</p>
          )}
        </div>
      )}
    </div>
  );
}
