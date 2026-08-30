import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { SPRING_PANEL, SPRING_PRESS } from '@/lib/ease';
import { lightHaptic } from '@/lib/haptic';
import { playSoundChoice } from '@/lib/soundUtils';
import { ToastService } from '@/services/ToastService';
import {
  attachStreamToVideo,
  getLiveVideoTrack,
  setTrackTorch,
  trackSupportsTorch,
} from '../cameraMedia';

interface MovementMobCameraOverlayProps {
  open: boolean;
  stream: MediaStream | null;
  onClose: () => void;
  onDetected: (code: string) => void;
  onManualBarcode?: () => void;
}

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

function getBarcodeDetector(): (new (options?: { formats?: string[] }) => BarcodeDetectorLike) | null {
  const ctor = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  return ctor ?? null;
}

const SCAN_LINE = {
  type: 'spring',
  stiffness: 32,
  damping: 16,
  mass: 1.1,
  repeat: Infinity,
  repeatType: 'reverse',
} as const;

export default function MovementMobCameraOverlay({
  open,
  stream,
  onClose,
  onDetected,
  onManualBarcode,
}: MovementMobCameraOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!open || !stream) return;

    let cancelled = false;
    let rafId = 0;
    let emitted = false;
    let zxingControls: IScannerControls | null = null;
    setError(null);
    setStarting(true);
    setTorchOn(false);

    const emitOnce = (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || emitted) return;
      emitted = true;
      playSoundChoice('scan', 'success');
      lightHaptic();
      onDetectedRef.current(trimmed);
    };

    const start = async () => {
      const videoEl = videoRef.current;
      if (!videoEl || cancelled) return;

      try {
        await attachStreamToVideo(videoEl, stream);
        if (cancelled) return;

        const track = getLiveVideoTrack(stream);
        setTorchAvailable(trackSupportsTorch(track));
        setStarting(false);

        const Detector = getBarcodeDetector();
        if (Detector) {
          const detector = new Detector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
          });

          const tick = async () => {
            if (cancelled || emitted || videoEl.readyState < 2) {
              if (!cancelled && !emitted) {
                rafId = window.requestAnimationFrame(() => { void tick(); });
              }
              return;
            }
            try {
              const codes = await detector.detect(videoEl);
              const value = codes.find((item) => item.rawValue)?.rawValue;
              if (value) {
                emitOnce(value);
                return;
              }
            } catch {
              // keep scanning
            }
            if (!cancelled && !emitted) {
              rafId = window.requestAnimationFrame(() => { void tick(); });
            }
          };
          void tick();
          return;
        }

        const reader = new BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromStream(stream, videoEl, (result) => {
          if (cancelled || !result) return;
          const text = result.getText();
          if (text) emitOnce(text);
        });
      } catch (err) {
        if (!cancelled) {
          setStarting(false);
          setError(err instanceof Error ? err.message : 'Не вдалося відкрити камеру');
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      zxingControls?.stop();
      const track = getLiveVideoTrack(stream);
      if (track) void setTrackTorch(track, false);
      const currentVideo = videoRef.current;
      if (currentVideo) currentVideo.srcObject = null;
    };
  }, [open, stream]);

  const toggleTorch = async () => {
    const track = getLiveVideoTrack(stream);
    if (!track || !trackSupportsTorch(track)) {
      ToastService.show({
        title: 'Ліхтар недоступний',
        description: 'Цей пристрій або браузер не підтримує ліхтар камери',
        color: 'warning',
      });
      return;
    }
    const next = !torchOn;
    const ok = await setTrackTorch(track, next);
    if (!ok) {
      ToastService.show({
        title: 'Ліхтар',
        description: 'Не вдалося перемкнути ліхтар',
        color: 'warning',
      });
      return;
    }
    setTorchOn(next);
    lightHaptic();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="camera-overlay"
          className="fixed inset-0 z-50 flex flex-col bg-black"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 32 }}
          transition={reduce ? { duration: 0.16 } : SPRING_PANEL}
        >
          <header className="relative z-20 flex h-14 shrink-0 items-center justify-center px-2 pt-[env(safe-area-inset-top)]">
            <motion.button
              type="button"
              aria-label="Закрити камеру"
              onClick={onClose}
              whileTap={reduce ? undefined : { scale: 0.9 }}
              transition={SPRING_PRESS}
              className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-white"
            >
              <DynamicIcon name="chevron-left" size={26} strokeWidth={2} />
            </motion.button>
            <h1 className="text-[17px] font-semibold text-white">Сканувати штрих-код</h1>
          </header>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />

            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
              <div
                className="relative aspect-square w-[min(72vw,280px)]"
                style={{ boxShadow: '0 0 0 200vmax rgba(0,0,0,0.58)' }}
              >
                <span className="pointer-events-none absolute -left-0.5 -top-0.5 h-10 w-10 rounded-tl-[4px] border-l-[3px] border-t-[3px] border-sky-400" />
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-10 w-10 rounded-tr-[4px] border-r-[3px] border-t-[3px] border-sky-400" />
                <span className="pointer-events-none absolute -bottom-0.5 -left-0.5 h-10 w-10 rounded-bl-[4px] border-b-[3px] border-l-[3px] border-sky-400" />
                <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-10 w-10 rounded-br-[4px] border-b-[3px] border-r-[3px] border-sky-400" />

                {!reduce && (
                  <motion.div
                    aria-hidden
                    className="absolute left-2 right-2 h-0.5 rounded-full bg-sky-400 shadow-[0_0_14px_4px_rgba(56,189,248,0.75)]"
                    initial={{ top: '10%' }}
                    animate={{ top: '88%' }}
                    transition={SCAN_LINE}
                  />
                )}
              </div>
              <p className="relative mt-8 max-w-[240px] text-center text-sm text-white/85">
                Наведіть штрих-код у рамку
              </p>
            </div>

            {starting && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
                <Spinner color="primary" />
              </div>
            )}
            {error && (
              <div className="absolute inset-x-4 bottom-28 z-20 rounded-lg bg-danger-500/90 px-3 py-2 text-sm text-white">
                {error}
              </div>
            )}
          </div>

          <div className="relative z-20 flex items-start justify-center gap-16 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            {onManualBarcode ? (
              <motion.button
                type="button"
                onClick={onManualBarcode}
                whileTap={reduce ? undefined : { scale: 0.92 }}
                transition={SPRING_PRESS}
                className="flex w-20 flex-col items-center gap-2 text-white"
              >
                <DynamicIcon name="keyboard" size={26} strokeWidth={1.6} />
                <span className="text-sm">Вручну</span>
              </motion.button>
            ) : null}

            <motion.button
              type="button"
              aria-pressed={torchOn}
              onClick={() => { void toggleTorch(); }}
              whileTap={reduce ? undefined : { scale: 0.92 }}
              transition={SPRING_PRESS}
              className={`flex w-20 flex-col items-center gap-2 ${torchOn ? 'text-sky-400' : 'text-white'} ${!torchAvailable ? 'opacity-70' : ''}`}
            >
              <DynamicIcon name={torchOn ? 'flashlight' : 'flashlight-off'} size={26} strokeWidth={1.6} />
              <span className="text-sm">Ліхтар</span>
            </motion.button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
