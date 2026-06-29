import { useEffect, useMemo, useRef, useState } from 'react';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';

interface UseWarehouseParamsOpts {
  returns?: any;
  externalStorages?: any[]; // optional list passed from parent (writeoff.storages)
  selectedStorageProp?: string | null;
  setSelectedStorageProp?: (v: string | null) => void;
  dateStateKey?: 'returnDate' | 'operDate';
}

export default function useWarehouseParams(opts: UseWarehouseParamsOpts = {}) {
  const { returns, externalStorages, selectedStorageProp, setSelectedStorageProp, dateStateKey = 'returnDate' } = opts;
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

  // default small storage id: prefer settings.smallStorageId only.
  // Do not fallback to the first storage automatically to avoid surprising defaults (e.g., incognito sessions).
  const defaultSmallStorageId = useMemo(() => {
    if (settings?.smallStorageId) return String(settings.smallStorageId);
    return null;
  }, [settings?.smallStorageId]);

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

  const formatLocalDate = (date: Date): string => {
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const parseLocalDate = (value: string): Date | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

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

  // Date handling: keep local time round-trip as 'YYYY-MM-DD HH:mm:ss'
  const dateForPicker = useMemo(() => {
    const s = returns?.[dateStateKey] ?? returns?.returnDate;
    if (!s) return new Date();
    try {
      const parsed = parseLocalDate(s);
      if (parsed) return parsed;
    } catch (e) {
      // ignore
    }
    return new Date();
  }, [returns?.returnDate]);

  const onDateChange = (d: Date) => {
    const formatted = formatLocalDate(d);
    if (dateStateKey === 'operDate') {
      returns?.setOperDate?.(formatted);
    } else {
      returns?.setReturnDate?.(formatted);
    }
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
