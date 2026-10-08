import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HrPersonTreeNode } from '@shared/types/hr';
import {
  collectAncestorIdsForNodes,
  flattenPersonTreeNodes,
} from '@shared/utils/personTreeOrder';

function mergeSearchWithAllFolders(
  searchNodes: HrPersonTreeNode[],
  fullNodes: HrPersonTreeNode[],
): HrPersonTreeNode[] {
  const groups = fullNodes.filter((node) => node.kind === 'group');
  const persons = searchNodes.filter((node) => node.kind === 'person');
  return [...groups, ...persons];
}

const MIN_SEARCH_LENGTH = 3;

export function usePersonsTree() {
  const [fullTreeNodes, setFullTreeNodes] = useState<HrPersonTreeNode[]>([]);
  const [searchResultNodes, setSearchResultNodes] = useState<HrPersonTreeNode[]>([]);
  const [searchShowAllFolders, setSearchShowAllFolders] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const searchShowAllFoldersRef = useRef(searchShowAllFolders);
  searchShowAllFoldersRef.current = searchShowAllFolders;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = search.trim();
      setDebouncedSearch(trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : '');
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadTreeNodes = useCallback(async (searchQuery?: string): Promise<HrPersonTreeNode[]> => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (duplicatesOnly) params.set('duplicates', 'true');
    const qs = params.toString() ? `?${params}` : '';
    const response = await fetch(`/api/hr/persons/tree${qs}`, { credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Не вдалося завантажити довідник');
    }
    return Array.isArray(data.data) ? data.data as HrPersonTreeNode[] : [];
  }, [duplicatesOnly]);

  const fetchTree = useCallback(async (options?: { refreshFullTree?: boolean }) => {
    setLoading(true);
    try {
      const nextNodes = await loadTreeNodes(debouncedSearch || undefined);
      if (debouncedSearch) {
        setSearchResultNodes(nextNodes);
        const personIds = new Set(
          nextNodes.filter((node) => node.kind === 'person').map((node) => node.id),
        );
        if (!searchShowAllFoldersRef.current) {
          setExpandedIds(collectAncestorIdsForNodes(nextNodes, personIds));
        }
        if (options?.refreshFullTree || searchShowAllFoldersRef.current) {
          const fullNodes = await loadTreeNodes();
          setFullTreeNodes(fullNodes);
        }
      } else {
        setFullTreeNodes(nextNodes);
        setSearchResultNodes([]);
        setSearchShowAllFolders(false);
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, loadTreeNodes]);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree]);

  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const nodes = useMemo(() => {
    if (!debouncedSearch) return fullTreeNodes;
    if (!searchShowAllFolders || fullTreeNodes.length === 0) return searchResultNodes;
    return mergeSearchWithAllFolders(searchResultNodes, fullTreeNodes);
  }, [debouncedSearch, fullTreeNodes, searchResultNodes, searchShowAllFolders]);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(nodes.filter((node) => node.kind === 'group').map((node) => node.id)));
  }, [nodes]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const collapseSubtree = useCallback((rootId: string) => {
    setExpandedIds((prev) => {
      const parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
      const isUnderRoot = (nodeId: string): boolean => {
        let current: string | null = nodeId;
        while (current) {
          if (current === rootId) return true;
          current = parentById.get(current) ?? null;
        }
        return false;
      };
      const next = new Set<string>();
      for (const id of prev) {
        if (!isUnderRoot(id)) next.add(id);
      }
      return next;
    });
  }, [nodes]);

  const fetchFullTree = useCallback(async (): Promise<HrPersonTreeNode[]> => {
    if (fullTreeNodes.length > 0) return fullTreeNodes;
    const response = await fetch('/api/hr/persons/tree', { credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Не вдалося завантажити довідник');
    }
    const nextNodes = Array.isArray(data.data) ? data.data as HrPersonTreeNode[] : [];
    setFullTreeNodes(nextNodes);
    return nextNodes;
  }, [fullTreeNodes]);

  const toggleSearchShowAllFolders = useCallback(async () => {
    const personIds = new Set(
      searchResultNodes.filter((node) => node.kind === 'person').map((node) => node.id),
    );

    if (!searchShowAllFolders) {
      const full = await fetchFullTree();
      const merged = mergeSearchWithAllFolders(searchResultNodes, full);
      const allGroupIds = full.filter((node) => node.kind === 'group').map((node) => node.id);
      setExpandedIds(new Set([
        ...collectAncestorIdsForNodes(merged, personIds),
        ...allGroupIds,
      ]));
      setSearchShowAllFolders(true);
      return;
    }

    setSearchShowAllFolders(false);
    setExpandedIds(collectAncestorIdsForNodes(searchResultNodes, personIds));
  }, [fetchFullTree, searchResultNodes, searchShowAllFolders]);

  useEffect(() => {
    if (debouncedSearch) return;
    setSearchShowAllFolders(false);
  }, [debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch || fullTreeNodes.length === 0) return;
    setExpandedIds((prev) => {
      if (prev.size > 0) return prev;
      const rootGroups = fullTreeNodes
        .filter((node) => node.kind === 'group' && node.parentId == null)
        .map((node) => node.id);
      return new Set(rootGroups);
    });
  }, [fullTreeNodes, debouncedSearch]);

  const visibleNodes = useMemo(
    () => flattenPersonTreeNodes(nodes, expandedIds),
    [nodes, expandedIds],
  );

  const runPersonsSync = useCallback(async (path: string) => {
    setSyncing(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Синхронізація не вдалась');
      }
      await fetchTree({ refreshFullTree: true });
      return data.data as {
        pulled?: number;
        updated?: number;
        groupsLinked?: number;
      };
    } finally {
      setSyncing(false);
    }
  }, [fetchTree]);

  const handleSync = useCallback(
    () => runPersonsSync('/api/hr/persons/sync/pull'),
    [runPersonsSync],
  );

  const handleSyncContacts = useCallback(
    () => runPersonsSync('/api/hr/persons/sync/pull/contacts'),
    [runPersonsSync],
  );

  const handleSyncGroups = useCallback(
    () => runPersonsSync('/api/hr/persons/sync/pull/groups'),
    [runPersonsSync],
  );

  return {
    nodes,
    visibleNodes,
    search,
    setSearch,
    duplicatesOnly,
    setDuplicatesOnly,
    loading,
    syncing,
    expandedIds,
    toggleExpanded,
    expandAll,
    collapseAll,
    collapseSubtree,
    fetchTree,
    handleSync,
    handleSyncContacts,
    handleSyncGroups,
    isSearchMode: Boolean(debouncedSearch),
    searchShowAllFolders,
    toggleSearchShowAllFolders,
  };
}
