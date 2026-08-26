import { describe, expect, it } from 'vitest';
import { PERMISSIONS, isPermissionKey } from '../constants/permissions';
import {
  canListCatalogFolderContents,
  canViewCatalogItem,
  catalogFolderEditKey,
  catalogFolderViewKey,
  collectCatalogFolderGrants,
  filterCatalogFolderChildren,
  filterCatalogTreeNodes,
  hasCatalogManage,
  isCatalogFolderPermission,
  isCatalogFolderVisibleInTree,
  resolveCatalogFolderAccess,
  resolveCatalogVisualRootFolderId,
} from './catalogFolderAccess';

const PARENT = 'p1';
const CHILD = 'c1';
const SIBLING = 's1';
const DEEP = 'd1';

const parentById = new Map<string, string | null>([
  [PARENT, null],
  [CHILD, PARENT],
  [SIBLING, PARENT],
  [DEEP, CHILD],
]);

describe('catalog folder keys', () => {
  it('matches KEY_FORMAT', () => {
    expect(isPermissionKey(catalogFolderViewKey('1100300000001001'))).toBe(true);
    expect(isPermissionKey(catalogFolderEditKey('1100300000001001'))).toBe(true);
  });

  it('detects folder permissions only', () => {
    expect(isCatalogFolderPermission(catalogFolderViewKey(PARENT))).toBe(true);
    expect(isCatalogFolderPermission(PERMISSIONS.ACTION_CATALOG_MANAGE)).toBe(false);
    expect(isCatalogFolderPermission(PERMISSIONS.PAGE_PRODUCTS)).toBe(false);
  });
});

describe('resolveCatalogFolderAccess', () => {
  it('manage grants view+edit everywhere including root', () => {
    const perms = [PERMISSIONS.ACTION_CATALOG_MANAGE];
    expect(hasCatalogManage(perms)).toBe(true);
    expect(resolveCatalogFolderAccess(perms, null, parentById)).toEqual({
      view: true,
      edit: true,
    });
    expect(resolveCatalogFolderAccess(perms, DEEP, parentById)).toEqual({
      view: true,
      edit: true,
    });
    expect(canListCatalogFolderContents(null, perms, parentById)).toBe(true);
  });

  it('view on parent covers descendants, not siblings of another branch', () => {
    const perms = [catalogFolderViewKey(CHILD)];
    expect(resolveCatalogFolderAccess(perms, CHILD, parentById)).toEqual({
      view: true,
      edit: false,
    });
    expect(resolveCatalogFolderAccess(perms, DEEP, parentById)).toEqual({
      view: true,
      edit: false,
    });
    expect(resolveCatalogFolderAccess(perms, PARENT, parentById)).toEqual({
      view: false,
      edit: false,
    });
    expect(resolveCatalogFolderAccess(perms, SIBLING, parentById)).toEqual({
      view: false,
      edit: false,
    });
  });

  it('edit on parent implies view on descendants', () => {
    const perms = [catalogFolderEditKey(PARENT)];
    expect(resolveCatalogFolderAccess(perms, DEEP, parentById)).toEqual({
      view: true,
      edit: true,
    });
  });

  it('view on parent + edit on child', () => {
    const perms = [catalogFolderViewKey(PARENT), catalogFolderEditKey(CHILD)];
    expect(resolveCatalogFolderAccess(perms, PARENT, parentById)).toEqual({
      view: true,
      edit: false,
    });
    expect(resolveCatalogFolderAccess(perms, CHILD, parentById)).toEqual({
      view: true,
      edit: true,
    });
    expect(resolveCatalogFolderAccess(perms, SIBLING, parentById)).toEqual({
      view: true,
      edit: false,
    });
  });

  it('collects edit as view grant', () => {
    const { viewIds, editIds } = collectCatalogFolderGrants([catalogFolderEditKey(PARENT)]);
    expect([...editIds]).toEqual([PARENT]);
    expect(viewIds.has(PARENT)).toBe(true);
  });
});

describe('tree filter', () => {
  const nodes = [
    { id: PARENT, parentId: null as string | null },
    { id: CHILD, parentId: PARENT },
    { id: SIBLING, parentId: PARENT },
    { id: DEEP, parentId: CHILD },
  ];

  it('hoists a single grant by dropping unary path-only ancestors', () => {
    const filtered = filterCatalogTreeNodes(nodes, [catalogFolderViewKey(CHILD)]);
    expect(filtered.map((n) => n.id).sort()).toEqual([CHILD, DEEP].sort());
    expect(filtered.find((n) => n.id === CHILD)?.parentId).toBeNull();
    expect(isCatalogFolderVisibleInTree(PARENT, [catalogFolderViewKey(CHILD)], parentById)).toBe(
      true
    );
    expect(canListCatalogFolderContents(PARENT, [catalogFolderViewKey(CHILD)], parentById)).toBe(
      false
    );
  });

  it('keeps a path-only parent that groups two granted branches', () => {
    const filtered = filterCatalogTreeNodes(nodes, [
      catalogFolderViewKey(CHILD),
      catalogFolderViewKey(SIBLING),
    ]);
    expect(filtered.map((n) => n.id).sort()).toEqual([CHILD, DEEP, PARENT, SIBLING].sort());
    expect(filtered.find((n) => n.id === CHILD)?.parentId).toBe(PARENT);
  });

  it('resolves visual root to the single granted branch', () => {
    const filtered = filterCatalogTreeNodes(nodes, [catalogFolderViewKey(CHILD)]);
    expect(resolveCatalogVisualRootFolderId(filtered, [catalogFolderViewKey(CHILD)])).toBe(CHILD);
    expect(
      resolveCatalogVisualRootFolderId(filtered, [PERMISSIONS.ACTION_CATALOG_MANAGE])
    ).toBeNull();
  });

  it('path-only parent lists only path children', () => {
    const children = [
      { id: CHILD, isGroup: true },
      { id: SIBLING, isGroup: true },
      { id: 'good1', isGroup: false },
    ];
    const visible = filterCatalogFolderChildren(
      PARENT,
      children,
      [catalogFolderViewKey(CHILD)],
      parentById
    );
    expect(visible.map((c) => c.id)).toEqual([CHILD]);
  });

  it('search hides goods in path-only folders', () => {
    expect(
      canViewCatalogItem(
        { id: 'good1', isGroup: false, parentId: PARENT },
        [catalogFolderViewKey(CHILD)],
        parentById
      )
    ).toBe(false);
    expect(
      canViewCatalogItem(
        { id: 'good2', isGroup: false, parentId: CHILD },
        [catalogFolderViewKey(CHILD)],
        parentById
      )
    ).toBe(true);
  });
});
