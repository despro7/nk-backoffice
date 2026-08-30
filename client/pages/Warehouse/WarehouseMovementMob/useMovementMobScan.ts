import { useCallback, useEffect, useRef, useState } from 'react';
import { useEquipmentFromAuth } from '@/contexts/AuthContext';
import { playSoundChoice } from '@/lib/soundUtils';
import { ToastService } from '@/services/ToastService';
import {
  decodeBarcodeFromFile,
  isLiveCameraAvailable,
  requestLiveCameraStream,
  stopMediaStream,
} from './cameraMedia';

const SCAN_DEDUPE_MS = 1000;

interface UseMovementMobScanOptions {
  enabled: boolean;
  /** Ignore HID lastBarcode (stepper focused or camera overlay). */
  pauseHid: boolean;
  onScan: (code: string) => void;
  useMockBarcode?: boolean;
  mockBarcode?: string;
}

export function useMovementMobScan({
  enabled,
  pauseHid,
  onScan,
  useMockBarcode = false,
  mockBarcode = '',
}: UseMovementMobScanOptions) {
  const [equipmentState, equipmentActions] = useEquipmentFromAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const preferCaptureRef = useRef(false);

  const lastRef = useRef({ code: '', at: 0 });
  const enabledRef = useRef(enabled);
  const onScanRef = useRef(onScan);
  enabledRef.current = enabled;
  onScanRef.current = onScan;

  const ingest = useCallback((raw: string, force = false) => {
    if (!enabledRef.current) return;
    const code = raw.trim();
    if (!code) return;

    const now = Date.now();
    if (!force && code === lastRef.current.code && now - lastRef.current.at < SCAN_DEDUPE_MS) {
      return;
    }
    lastRef.current = { code, at: now };
    setInputValue('');
    onScanRef.current(code);
  }, []);

  const hidPaused = pauseHid || cameraOpen;

  useEffect(() => {
    if (!enabled) return;
    const barcode = equipmentState.lastBarcode;
    if (!barcode?.code) return;

    if (!hidPaused) {
      ingest(barcode.code);
    }
    equipmentActions.resetScanner();
  }, [equipmentState.lastBarcode, enabled, hidPaused, ingest, equipmentActions]);

  const focusScanField = useCallback(() => {
    window.setTimeout(() => {
      const node = inputRef.current
        ?? (document.getElementById('movement-mob-scan-input') as HTMLInputElement | null);
      node?.focus();
    }, 50);
  }, []);

  const submitInput = useCallback(() => {
    ingest(inputValue);
  }, [ingest, inputValue]);

  const openCapturePicker = useCallback(() => {
    captureInputRef.current?.click();
  }, []);

  const ingestMockBarcode = useCallback((): boolean => {
    if (!useMockBarcode) return false;
    const code = mockBarcode.trim();
    if (!code) {
      ToastService.show({
        title: 'Мок-ШК порожній',
        description: 'Вкажіть штрих-код у полі mock-barcode',
        color: 'warning',
      });
      return true;
    }
    ingest(code, true);
    return true;
  }, [ingest, mockBarcode, useMockBarcode]);

  const openCamera = useCallback(() => {
    if (ingestMockBarcode()) return;

    if (!isLiveCameraAvailable() || preferCaptureRef.current) {
      openCapturePicker();
      return;
    }

    void requestLiveCameraStream()
      .then((stream) => {
        setLiveStream(stream);
        setCameraOpen(true);
      })
      .catch((err) => {
        preferCaptureRef.current = true;
        const description = err instanceof Error
          ? err.message
          : 'Не вдалося відкрити камеру. Спробуйте ще раз — відкриється фотоапарат.';
        ToastService.show({
          title: 'Камера',
          description,
          color: 'warning',
        });
      });
  }, [ingestMockBarcode, openCapturePicker]);

  const closeCamera = useCallback(() => {
    setCameraOpen(false);
    setLiveStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
  }, []);

  const handleCaptureFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const code = await decodeBarcodeFromFile(file);
    if (!code) {
      ToastService.show({
        title: 'Штрих-код не розпізнано',
        description: 'Сфотографуйте код ближче й рівніше або введіть його вручну',
        color: 'warning',
      });
      return;
    }
    playSoundChoice('scan', 'success');
    ingest(code);
  }, [ingest]);

  return {
    inputRef,
    inputValue,
    setInputValue,
    submitInput,
    ingest,
    cameraOpen,
    liveStream,
    openCamera,
    closeCamera,
    captureInputRef,
    handleCaptureFile,
    focusScanField,
  };
}
