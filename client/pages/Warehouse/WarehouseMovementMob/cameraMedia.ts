import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] as const;
const DECODE_MAX_EDGES = [1600, 800, 2400] as const;

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  success: (stream: MediaStream) => void,
  failure: (error: Error) => void,
) => void;

function getBarcodeDetectorCtor(): (new (options?: { formats?: string[] }) => BarcodeDetectorLike) | null {
  const ctor = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  return ctor ?? null;
}

function getGetUserMedia(): ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null {
  const nav = navigator as Navigator & {
    webkitGetUserMedia?: LegacyGetUserMedia;
    mozGetUserMedia?: LegacyGetUserMedia;
  };

  if (typeof nav.mediaDevices?.getUserMedia === 'function') {
    return nav.mediaDevices.getUserMedia.bind(nav.mediaDevices);
  }

  const legacy = nav.webkitGetUserMedia ?? nav.mozGetUserMedia;
  if (!legacy) return null;

  return (constraints) =>
    new Promise((resolve, reject) => {
      legacy.call(nav, constraints, resolve, reject);
    });
}

function createZxingReader(): BrowserMultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.QR_CODE,
  ]);
  return new BrowserMultiFormatReader(hints);
}

function drawToCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function rotateCanvas(source: HTMLCanvasElement, degrees: 90 | 180 | 270): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const swap = degrees === 90 || degrees === 270;
  canvas.width = swap ? source.height : source.width;
  canvas.height = swap ? source.width : source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function invertCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const srcCtx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx || !srcCtx) return canvas;
  const image = srcCtx.getImageData(0, 0, source.width, source.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Прямокутник оверлею (рамка) → координати в кадрі video з урахуванням object-cover. */
export function mapCoveredOverlayToVideoSource(
  video: HTMLVideoElement,
  overlay: HTMLElement,
): { sx: number; sy: number; sw: number; sh: number } | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const videoRect = video.getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();
  if (videoRect.width <= 0 || videoRect.height <= 0 || overlayRect.width <= 0 || overlayRect.height <= 0) {
    return null;
  }

  const scale = Math.max(videoRect.width / vw, videoRect.height / vh);
  const displayedW = vw * scale;
  const displayedH = vh * scale;
  const cropX = (displayedW - videoRect.width) / 2;
  const cropY = (displayedH - videoRect.height) / 2;

  const sx = (overlayRect.left - videoRect.left + cropX) / scale;
  const sy = (overlayRect.top - videoRect.top + cropY) / scale;
  const sw = overlayRect.width / scale;
  const sh = overlayRect.height / scale;

  const clampedSx = Math.max(0, Math.min(vw, sx));
  const clampedSy = Math.max(0, Math.min(vh, sy));
  const clampedSw = Math.max(1, Math.min(vw - clampedSx, sw));
  const clampedSh = Math.max(1, Math.min(vh - clampedSy, sh));
  if (clampedSw < 8 || clampedSh < 8) return null;
  return { sx: clampedSx, sy: clampedSy, sw: clampedSw, sh: clampedSh };
}

export function drawVideoRegionToCanvas(
  video: HTMLVideoElement,
  region: { sx: number; sy: number; sw: number; sh: number },
  canvas: HTMLCanvasElement,
): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const width = Math.max(1, Math.round(region.sw));
  const height = Math.max(1, Math.round(region.sh));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.drawImage(video, region.sx, region.sy, region.sw, region.sh, 0, 0, width, height);
  return true;
}

export function createLiveBarcodeScanner(): (canvas: HTMLCanvasElement) => Promise<string | null> {
  const Detector = getBarcodeDetectorCtor();
  if (Detector) {
    const detector = new Detector({ formats: [...BARCODE_FORMATS] });
    return async (canvas) => {
      try {
        const codes = await detector.detect(canvas);
        return codes.find((item) => item.rawValue?.trim())?.rawValue?.trim() ?? null;
      } catch {
        return null;
      }
    };
  }

  const reader = createZxingReader();
  return async (canvas) => {
    try {
      return reader.decodeFromCanvas(canvas).getText().trim() || null;
    } catch {
      return null;
    }
  };
}

export async function detectBarcodeOnCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const Detector = getBarcodeDetectorCtor();
  if (Detector) {
    try {
      const detector = new Detector({ formats: [...BARCODE_FORMATS] });
      const codes = await detector.detect(canvas);
      const value = codes.find((item) => item.rawValue?.trim())?.rawValue?.trim();
      if (value) return value;
    } catch {
      // Safari/Android часто не мають BarcodeDetector — падаємо на ZXing.
    }
  }

  try {
    const result = createZxingReader().decodeFromCanvas(canvas);
    const text = result.getText().trim();
    return text || null;
  } catch {
    return null;
  }
}

async function decodeCanvasVariants(base: HTMLCanvasElement): Promise<string | null> {
  const variants = [base, invertCanvas(base), rotateCanvas(base, 90), rotateCanvas(base, 270), rotateCanvas(base, 180)];
  for (const canvas of variants) {
    const value = await detectBarcodeOnCanvas(canvas);
    if (value) return value;
  }
  return null;
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Не вдалося відкрити фото'));
    image.src = url;
  });
  await image.decode?.().catch(() => undefined);
  return image;
}

async function fileToCanvases(file: File): Promise<HTMLCanvasElement[]> {
  const canvases: HTMLCanvasElement[] = [];

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        for (const edge of DECODE_MAX_EDGES) {
          canvases.push(drawToCanvas(bitmap, bitmap.width, bitmap.height, edge));
        }
      } finally {
        if (typeof bitmap.close === 'function') bitmap.close();
      }
      return canvases;
    } catch {
      // HEIC / непідтримуваний формат — пробуємо через <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(url);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    for (const edge of DECODE_MAX_EDGES) {
      canvases.push(drawToCanvas(image, width, height, edge));
    }
  } finally {
    URL.revokeObjectURL(url);
  }

  return canvases;
}

/** Live preview потребує secure context: HTTPS або localhost. HTTP по IP на телефоні — mediaDevices === undefined. */
export function isLiveCameraAvailable(): boolean {
  return Boolean(window.isSecureContext && getGetUserMedia());
}

export async function requestLiveCameraStream(): Promise<MediaStream> {
  const gum = getGetUserMedia();
  if (!gum) {
    if (!window.isSecureContext) {
      throw new Error(
        'Камера в браузері доступна лише через HTTPS або localhost. Зробіть фото ШК або введіть код вручну.',
      );
    }
    throw new Error('Камера недоступна в цьому браузері. Зробіть фото ШК або введіть код вручну.');
  }

  try {
    return await gum({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch {
    return await gum({ video: true, audio: false });
  }
}

export async function decodeBarcodeFromFile(file: File): Promise<string | null> {
  try {
    const canvases = await fileToCanvases(file);
    for (const canvas of canvases) {
      const value = await decodeCanvasVariants(canvas);
      if (value) return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.muted = true;
  video.autoplay = true;
  video.srcObject = stream;

  const play = () => video.play().then(() => undefined).catch(() => undefined);

  if (video.readyState >= 2) {
    return play();
  }

  return new Promise((resolve) => {
    const onReady = () => {
      video.removeEventListener('loadedmetadata', onReady);
      void play().then(resolve);
    };
    video.addEventListener('loadedmetadata', onReady);
  });
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

export function getLiveVideoTrack(stream: MediaStream | null | undefined): MediaStreamTrack | null {
  return stream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null;
}

export function trackSupportsTorch(track: MediaStreamTrack | null): boolean {
  if (!track || typeof track.getCapabilities !== 'function') return false;
  try {
    return Boolean((track.getCapabilities() as TorchCapabilities).torch);
  } catch {
    return false;
  }
}

export async function setTrackTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as unknown as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}
