import { useEffect, useMemo, useRef, useState } from 'react';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';

interface UseWarehouseParamsOpts {
  returns?: any;
  externalStorages?: any[]; // optional list passed from parent (writeoff.storages)
  selectedStorageProp?: string | null;
  setSelectedStorageProp?: (v: string | null) => void;
}

export default function useWarehouseParams(opts: UseWarehouseParamsOpts = {}) {
  const { returns, externalStorages, selectedStorageProp, setSelectedStorageProp } = opts;
  const dirsCtx = useDilovodDirectories();
  const { settings } = useDilovodSettings();

  const STORAGE_KEY = 'warehouse.selectedStorage';
  const persisted = (typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null) || null;
  const [localSelectedStorage, setLocalSelectedStorage] = useState<string | null>(selectedStorageProp ?? persisted ?? null);
  const initializedRef = useRef(false);
  const FIRM_KEY = 'warehouse.receiveFirmId';
  const persistedFirm = (typeof window !== 'undefined' ? sessionStorage.getItem(FIRM_KEY) : null) || null;
  const firmInitializedRef = useRef(false);

  // Ensure directories loaded
  useEffect(() => {
    void dirsCtx.loadDirectories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Normalized storages: prefer externalStorages (explicit), then provider directories
  const storages = useMemo(() => {
    const src = Array.isArray(externalStorages) && externalStorages.length > 0
      ? externalStorages
      : Array.isArray(dirsCtx.directories?.storages) ? dirsCtx.directories!.storages : [];
    // Normalize minimal shape: id/code/name
    return (src || []).map((s: any) => ({ id: String(s.id), code: s.code ?? '', name: s.name ?? '' }));
  }, [externalStorages, dirsCtx.directories]);

  // Firms
  const firms = useMemo(() => {
    const src = Array.isArray(dirsCtx.directories?.firms) ? dirsCtx.directories!.firms : (returns?.availableFirms ?? []);
    return (src || []).map((f: any) => ({ id: String(f.id), name: f.name }));
  }, [dirsCtx.directories, returns?.availableFirms]);

  // default small storage id: settings.smallStorageId preferred, otherwise fallback to first storage id
  const defaultSmallStorageId = useMemo(() => {
    if (settings?.smallStorageId) return String(settings.smallStorageId);
    if (storages && storages.length > 0) return String(storages[0].id);
    return null;
  }, [settings?.smallStorageId, storages]);

  // Controlled vs uncontrolled selectedStorage
  const selectedStorage = selectedStorageProp !== undefined ? selectedStorageProp : localSelectedStorage;
  const setSelectedStorage = (v: string | null) => {
    if (typeof setSelectedStorageProp === 'function') return setSelectedStorageProp(v);
    setLocalSelectedStorage(v);
    try {
      if (typeof window !== 'undefined') {
        if (v == null) sessionStorage.removeItem(STORAGE_KEY);
        else sessionStorage.setItem(STORAGE_KEY, String(v));
      }
    } catch (e) {
      // ignore sessionStorage errors
    }
  };

  // Initialize selected storage from persisted value or defaultSmallStorageId.
  // Run once per mount (guarded by initializedRef) so navigation between pages doesn't overwrite user's selection.
  useEffect(() => {
    if (initializedRef.current) return;
    if (selectedStorage) {
      initializedRef.current = true;
      return;
    }
    const persistedNow = (typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null) || null;
    if (persistedNow) {
      setSelectedStorage(persistedNow);
      initializedRef.current = true;
      return;
    }
    if (defaultSmallStorageId) {
      setSelectedStorage(defaultSmallStorageId);
      initializedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSmallStorageId]);

  // Initialize receiveFirmId from sessionStorage, settings.defaultFirmId, or first firm — run once per mount
  useEffect(() => {
    if (firmInitializedRef.current) return;
    if (!returns || typeof returns.setReceiveFirmId !== 'function') {
      firmInitializedRef.current = true;
      return;
    }
    if (returns.receiveFirmId) {
      firmInitializedRef.current = true;
      return;
    }
    const persistedNow = (typeof window !== 'undefined' ? sessionStorage.getItem(FIRM_KEY) : null) || null;
    if (persistedNow) {
      returns.setReceiveFirmId?.(persistedNow);
      firmInitializedRef.current = true;
      return;
    }
    if (settings?.defaultFirmId) {
      returns.setReceiveFirmId?.(String(settings.defaultFirmId));
      firmInitializedRef.current = true;
      return;
    }
    // Do not fallback to first firm immediately — wait for settings or persisted value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firms, settings?.defaultFirmId, returns]);

  // Persist receiveFirmId changes to sessionStorage
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const v = returns?.receiveFirmId ?? null;
      if (v == null) sessionStorage.removeItem(FIRM_KEY);
      else sessionStorage.setItem(FIRM_KEY, String(v));
    } catch (e) {
      // ignore sessionStorage errors
    }
  }, [returns?.receiveFirmId]);

  const selectedStorageName = useMemo(() => {
    if (!selectedStorage) return '';
    const found = storages.find((s) => String(s.id) === String(selectedStorage));
    if (!found) return String(selectedStorage);
    return found.name || found.code || String(found.id);
  }, [storages, selectedStorage]);

  // Date handling: use returns.returnDate when provided; store as UTC 'YYYY-MM-DD HH:mm:ss'
  const dateForPicker = useMemo(() => {
    const s = returns?.returnDate;
    if (!s) return new Date();
    try {
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
        const [datePart, timePart] = s.split(' ');
        const [y, m, d] = datePart.split('-').map(Number);
        const [hh, mm, ss] = timePart.split(':').map(Number);
        return new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0));
      }
      const parsed = new Date(s);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    } catch (e) {
      // ignore
    }
    return new Date();
  }, [returns?.returnDate]);

  const onDateChange = (d: Date) => {
    const formatted = new Date(d.getTime()).toISOString().replace('T', ' ').substring(0, 19);
    returns?.setReturnDate?.(formatted);
  };

  return {
    storages,
    firms,
    defaultSmallStorageId,
    selectedStorage,
    setSelectedStorage,
    selectedStorageName,
    dateForPicker,
    onDateChange,
    ensureDirectoriesLoaded: async () => { await dirsCtx.loadDirectories(); },
  };
}
