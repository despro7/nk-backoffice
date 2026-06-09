import { useState, useEffect } from 'react';
import { useWarehouseReturns } from '../WarehouseReturns/useWarehouseReturns';
import useWarehouseParams from '../shared/useWarehouseParams';

export default function useReleaseSets() {
  const returns = useWarehouseReturns();
  const { storages, selectedStorage, setSelectedStorage, selectedStorageName } = useWarehouseParams({ returns });
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // useWarehouseParams handles directories loading and selected storage initialization
  useEffect(() => {
    returns.loadAvailableFirms?.().catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      date: returns.returnDate ?? null,
      firmId: safeFirmId(returns.receiveFirmId),
      comment: returns.comment ?? null,
      dryRun: true,
    };
    const resp = await fetch('/api/warehouse/releases/send', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return resp.ok ? await resp.json().catch(() => null) : null;
  };

  const requestSend = async () => {
    try {
      const safeFirmId = (id: any) => {
        if (id == null) return undefined;
        return id;
      };
      const body = {
        items: items.map((it) => ({ set_sku: it.setSku, quantity: it.quantity, components_snapshot: it.componentsSnapshot })),
        storageId: selectedStorage,
        date: returns.returnDate ?? null,
        firmId: safeFirmId(returns.receiveFirmId),
        comment: returns.comment ?? null,
        dryRun: false,
        status: 'created',
      };
      const resp = await fetch('/api/warehouse/releases/send', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
