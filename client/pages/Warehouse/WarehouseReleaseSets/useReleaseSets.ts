import { useState, useEffect } from 'react';
import { useWarehouseReturns } from '../WarehouseReturns/useWarehouseReturns';
import useWarehouseParams from '../shared/useWarehouseParams';

export default function useReleaseSets() {
  const returns = useWarehouseReturns();
  const { storages, selectedStorage, setSelectedStorage, selectedStorageName, defaultSmallStorageId } = useWarehouseParams({ returns });
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archiveSessions, setArchiveSessions] = useState<any[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const formatLocalDate = (date: Date): string => {
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const parseLocalDate = (value: unknown): Date | null => {
    if (typeof value !== 'string' || value.trim() === '') {
      return null;
    }

    const trimmed = value.trim();
    const localMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
    if (localMatch) {
      const [, year, month, day, hours, minutes, seconds] = localMatch;
      return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hours),
        Number(minutes),
        Number(seconds ?? '0'),
      );
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const getPayloadDate = (): string | null => {
    const parsed = parseLocalDate(returns.returnDate);
    return parsed ? formatLocalDate(parsed) : null;
  };

  const isDeletedRelease = (record: any): boolean => String(record?.status ?? '').toLowerCase() === 'deleted';

  // useWarehouseParams handles directories loading and selected storage initialization
  useEffect(() => {
    returns.loadAvailableFirms?.().catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addSet = async (setItem: any) => {
    if (items.length > 0) {
      return;
    }

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

  const buildSetRemark = (item: any): string | null => {
    if (!item) {
      return null;
    }

    const quantity = Number(item.quantity ?? 0);
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const setName = String(item.name || item.title || item.setSku || item.sku || '').trim();

    if (!setName) {
      return null;
    }

    return `${safeQuantity} х ${setName}`;
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
      date: getPayloadDate(),
      firmId: safeFirmId(returns.receiveFirmId),
      comment: returns.comment ?? null,
      remark: buildSetRemark(items[0]),
      dryRun: true,
    };
    const resp = await fetch('/api/warehouse/releases/send', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return resp.ok ? await resp.json().catch(() => null) : null;
  };

  const requestSend = async () => {
    try {
      const currentItems = items.map((it) => ({
        set_sku: it.setSku,
        quantity: it.quantity,
        components_snapshot: it.componentsSnapshot,
      }));
      const currentRemark = buildSetRemark(items[0]);
      const safeFirmId = (id: any) => {
        if (id == null) return undefined;
        return id;
      };
      const body = {
        items: currentItems,
        storageId: selectedStorage,
        date: getPayloadDate(),
        firmId: safeFirmId(returns.receiveFirmId),
        comment: returns.comment ?? null,
        remark: currentRemark,
        dryRun: false,
        status: 'created',
      };
      const resp = await fetch('/api/warehouse/releases/send', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.success) {
        const historyComment = [currentRemark, returns.comment ? String(returns.comment).trim() : ''].filter(Boolean).join(' | ') || null;
        const historyResp = await fetch('/api/warehouse/releases', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: currentItems,
            storageId: selectedStorage,
            firmId: safeFirmId(returns.receiveFirmId),
            comment: historyComment,
            remark: currentRemark,
            status: 'created',
            dilovodDocId: json.dilovodDocId ?? null,
          }),
        });
        const historyJson = await historyResp.json().catch(() => ({}));

        setItems([]);
        if (historyResp.ok && historyJson.success) {
          await loadHistory();
        }

        return {
          ...json,
          historySaved: Boolean(historyResp.ok && historyJson.success),
          historyResponse: historyJson,
        };
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
      if (resp.ok && json.success) {
        const records = Array.isArray(json.data) ? json.data : [];
        setHistory(records.filter((record: any) => !isDeletedRelease(record)));
        setArchiveSessions(records.filter((record: any) => isDeletedRelease(record)));
      }
    } catch (e) {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadArchive = async () => {
    setArchiveLoading(true);
    try {
      const resp = await fetch('/api/warehouse/releases', { credentials: 'include' });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.success) {
        const records = Array.isArray(json.data) ? json.data : [];
        setArchiveSessions(records.filter((record: any) => isDeletedRelease(record)));
      }
    } catch (e) {
      // ignore
    } finally {
      setArchiveLoading(false);
    }
  };

  const deleteRecord = async (id: number, forceLocal = false) => {
    const url = forceLocal ? `/api/warehouse/releases/${encodeURIComponent(String(id))}?forceLocal=true` : `/api/warehouse/releases/${encodeURIComponent(String(id))}`;
    const resp = await fetch(url, { method: 'DELETE', credentials: 'include' });
    const json = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, json };
  };

  useEffect(() => { void loadHistory(); }, []);

  return {
    returns,
    items,
    addSet,
    buildSetRemark,
    updateItem,
    removeItem,
    clearAll,
    storages,
    selectedStorage,
    selectedStorageName,
    defaultSmallStorageId,
    setSelectedStorage,
    buildPreview,
    requestSend,
    history,
    historyLoading,
    archiveSessions,
    archiveLoading,
    loadHistory,
    loadArchive,
    deleteRecord,
  };
}
