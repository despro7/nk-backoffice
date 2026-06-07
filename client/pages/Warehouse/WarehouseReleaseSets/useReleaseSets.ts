import { useState, useEffect } from 'react';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { useWarehouseReturns } from '../WarehouseReturns/useWarehouseReturns';

export default function useReleaseSets() {
  const returns = useWarehouseReturns();
  // useDilovodDirectories на верхньому рівні хука (правило хуків)
  const dirsCtx = useDilovodDirectories();

  const [items, setItems] = useState<any[]>([]);
  const [storages, setStorages] = useState<any[]>([]);
  const [selectedStorage, setSelectedStorage] = useState<string | null>(null);
  // Human-readable selected storage name (derived from `storages`)
  const selectedStorageName = (() => {
    if (!selectedStorage) return null;
    const found = storages.find((s) => String(s.id) === String(selectedStorage) || String(s.good_id) === String(selectedStorage));
    if (!found) return String(selectedStorage);
    return found.name || found.title || found.storageDisplayName || found.storage_display_name || found.storage || String(found.id);
  })();
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Ініціює завантаження довідників і фірм один раз при монтуванні
  useEffect(() => {
    void dirsCtx.loadDirectories();
    returns.loadAvailableFirms?.().catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Синхронізує локальний стан складів щоразу, коли провайдер оновлює дані
  useEffect(() => {
    const s = dirsCtx.directories?.storages || [];
    if (s.length === 0) return;
    setStorages(s);
    // smallStorageId зберігається у Settings, а не в Directories —
    // якщо провайдер не містить його, просто обираємо перший склад як дефолт
    const smallId: string | null = (dirsCtx.directories as any)?.smallStorageId || null;
    if (smallId) {
      const found = s.find((st: any) => String(st.id) === String(smallId) || String(st.good_id) === String(smallId));
      setSelectedStorage(found ? String(found.id ?? found.good_id ?? smallId) : String(smallId));
    }
  }, [dirsCtx.directories]);

  const addSet = async (setItem: any) => {
    const id = crypto.randomUUID?.() ?? `${setItem.sku}-${Date.now()}`;
    const newItem = {
      id,
      setSku: setItem.sku,
      name: setItem.name || setItem.title || setItem.sku,
      quantity: setItem.quantity ?? 1,
      componentsSnapshot: setItem.componentsSnapshot ?? setItem.set ?? [],
    };
    setItems((s) => [...s, newItem]);
  };

  const updateItem = (id: string, patch: Partial<any>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const clearAll = () => {
    returns.resetAllState?.();
    setItems([]);
  };

  const buildPreview = async () => {
    const safeFirmId = (id: any) => {
      if (id == null) return undefined;
      // Preserve string IDs (Dilovod uses large string IDs); if numeric-like, keep as-is
      return id;
    };
    const body = {
      items: items.map((it) => ({ set_sku: it.setSku, quantity: it.quantity, components_snapshot: it.componentsSnapshot })),
      storageId: selectedStorage,
      firmId: safeFirmId(returns.receiveFirmId),
    };
    const resp = await fetch('/api/warehouse/releases/preview', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return resp.ok ? await resp.json().catch(() => null) : null;
  };

  const requestSend = async () => {
    try {
      // Ensure server-side expansion is captured in componentsSnapshot for each item
      // Ensure each item has an expanded componentsSnapshot (server-side preview)
      const itemsWithSnapshot = await Promise.all(items.map(async (it) => {
        try {
          // Skip per-item preview when set SKU is not present
          if (!it.setSku) return { ...it, componentsSnapshot: it.componentsSnapshot || [] };
          const resp = await fetch('/api/warehouse/releases/preview', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ set_sku: it.setSku, quantity: it.quantity }] }) });
          if (resp.ok) {
            const json = await resp.json().catch(() => null);
            if (json && json.success && Array.isArray(json.data)) {
              return { ...it, componentsSnapshot: json.data };
            }
          }
        } catch (e) {
          // ignore per-item preview error and fallback to existing snapshot
        }
        return { ...it, componentsSnapshot: it.componentsSnapshot || [] };
      }));

      const safeFirmId = (id: any) => {
        if (id == null) return undefined;
        return id;
      };
      const body = {
        items: itemsWithSnapshot.map((it) => ({ set_sku: it.setSku, quantity: it.quantity, components_snapshot: it.componentsSnapshot })),
        storageId: selectedStorage,
        firmId: safeFirmId(returns.receiveFirmId),
        comment: returns.comment ?? null,
        status: 'created',
      };
      const resp = await fetch('/api/warehouse/releases', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.success) {
        setItems([]);
        await loadHistory();
        return json;
      }
      return json;
    } catch (e) {
      throw e;
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const resp = await fetch('/api/warehouse/releases', { credentials: 'include' });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.success) setHistory(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteRecord = async (id: number) => {
    const resp = await fetch(`/api/warehouse/releases/${encodeURIComponent(String(id))}`, { method: 'DELETE', credentials: 'include' });
    if (resp.ok) await loadHistory();
  };

  useEffect(() => { void loadHistory(); }, []);

  return {
    returns,
    items,
    addSet,
    updateItem,
    removeItem,
    clearAll,
    storages,
    selectedStorage,
    selectedStorageName,
    setSelectedStorage,
    buildPreview,
    requestSend,
    history,
    historyLoading,
    loadHistory,
    deleteRecord,
  };
}
