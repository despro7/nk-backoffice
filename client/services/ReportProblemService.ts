import type {
  SupportReportPayload,
  SupportReportPublicConfig,
  SupportReportResponse,
  ScreenshotCaptureMode,
} from '@shared/types/supportReport';
import { DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS } from '@shared/types/supportReport';
import { ClientLogBuffer } from './ClientLogBuffer';

type ReportUser = {
  id?: number;
  email?: string;
  name?: string | null;
  role?: string;
};

declare const __APP_VERSION__: string;

const DEFAULT_CONFIG: SupportReportPublicConfig = {
  clientLogLines: 100,
  clientLogLevels: DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS,
  maxCommentLength: 500,
  maxScreenshotMb: 5,
  rateLimitSeconds: 60,
};

const CAPTURE_JPEG_QUALITY = 0.88;

let cachedConfig: SupportReportPublicConfig | null = null;
let screenshotModulePromise: Promise<typeof import('modern-screenshot')> | null = null;

function loadScreenshotModule(): Promise<typeof import('modern-screenshot')> {
  if (!screenshotModulePromise) {
    screenshotModulePromise = import('modern-screenshot');
  }
  return screenshotModulePromise;
}

export const REPORT_CAPTURE_EXCLUDE_CLASS = 'report-capture-exclude';
export const REPORT_CAPTURE_CHROME_ATTR = 'data-report-capture-chrome';

let reportCaptureUiHidden = false;

/** Ховає FAB, tab bar, action bubbles тощо перед native/DOM-скриншотом. */
export function setReportCaptureUiHidden(hidden: boolean): void {
  reportCaptureUiHidden = hidden;
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('report-capture-ui-hidden', hidden);
}

export function isReportCaptureUiHidden(): boolean {
  return reportCaptureUiHidden;
}

function shouldIncludeInScreenshot(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  if (node.getAttribute('type') === 'password') return false;
  if (node.getAttribute('data-report-fab') === 'true') return false;
  if (node.closest('[data-report-fab="true"]')) return false;
  if (node.getAttribute('data-report-capture-chrome') === 'true') return false;
  if (node.closest('[data-report-capture-chrome="true"]')) return false;
  if (node.closest('[data-report-modal="true"]')) return false;
  if (node.classList.contains(REPORT_CAPTURE_EXCLUDE_CLASS)) return false;
  if (node.closest(`.${REPORT_CAPTURE_EXCLUDE_CLASS}`)) return false;
  // HeroUI / React Aria backdrop і wrapper модалок
  if (node.getAttribute('data-slot') === 'backdrop') return false;
  if (node.closest('[data-slot="backdrop"]')) return false;
  return true;
}

/** Чекаємо закриття модалки/backdrop перед DOM-скриншотом */
export async function waitBeforeDomCapture(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 320));
}

function estimateBase64Bytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не вдалося обробити скриншот'));
    img.src = dataUrl;
  });
}

async function compressScreenshotIfNeeded(
  dataUrl: string,
  maxMb: number,
): Promise<string> {
  const maxBytes = maxMb * 1024 * 1024;
  if (estimateBase64Bytes(dataUrl) <= maxBytes) return dataUrl;

  const img = await loadImage(dataUrl);
  let scale = 1;
  let quality = 0.9;

  for (let attempt = 0; attempt < 10; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) break;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    if (estimateBase64Bytes(compressed) <= maxBytes) return compressed;

    if (quality > 0.45) {
      quality -= 0.1;
    } else {
      scale *= 0.85;
      quality = 0.85;
    }
  }

  throw new Error(
    `Скриншот занадто великий (>${maxMb} МБ). Спробуйте зменшити вікно браузера.`,
  );
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function getDomCaptureTarget(): HTMLElement {
  return document.documentElement;
}

function buildDomCaptureOptions(mode: 'viewport' | 'fullpage') {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const captureScale = Math.min(window.devicePixelRatio || 1, 2);

  if (mode === 'fullpage') {
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      scale: 1,
      quality: CAPTURE_JPEG_QUALITY,
      backgroundColor: '#e5e7eb',
      font: {},
      fetch: { bypassingCache: false },
      features: {
        copyScrollbar: true,
        restoreScrollPosition: true,
      },
      filter: shouldIncludeInScreenshot,
    };
  }

  // Viewport: зсув DOM на поточний scroll без зміни layout-width
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scale: captureScale,
    quality: CAPTURE_JPEG_QUALITY,
    backgroundColor: '#e5e7eb',
    font: {},
    style: {
      transform: `translate(-${scrollX}px, -${scrollY}px)`,
      transformOrigin: 'top left',
    } as Partial<CSSStyleDeclaration>,
    fetch: { bypassingCache: false },
    features: {
      copyScrollbar: false,
      restoreScrollPosition: true,
    },
    filter: shouldIncludeInScreenshot,
  };
}

type NativeCaptureFailureReason = 'cancelled' | 'unavailable' | 'error';

type NativeCaptureResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: NativeCaptureFailureReason };

export type ScreenshotCaptureResult = {
  dataUrl: string | null;
  mode: ScreenshotCaptureMode;
  /** Користувач скасував native picker — fallback на DOM */
  nativeCancelled?: boolean;
};

/** Screen Capture API (getDisplayMedia) — desktop Chrome/Edge/Firefox/Safari 15+ */
export function isNativeCaptureAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (!navigator.mediaDevices?.getDisplayMedia) return false;
  // iOS — tab capture практично недоступний
  if (/iPad|iPhone|iPod/u.test(navigator.userAgent)) return false;
  return true;
}

async function captureViaDisplayMediaDetailed(): Promise<NativeCaptureResult> {
  if (!isNativeCaptureAvailable()) {
    return { ok: false, reason: 'unavailable' };
  }

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
      } as MediaTrackConstraints,
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions & { preferCurrentTab?: boolean; selfBrowserSurface?: string });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await waitForNextPaint();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'error' };
    ctx.drawImage(video, 0, 0);
    return { ok: true, dataUrl: canvas.toDataURL('image/jpeg', CAPTURE_JPEG_QUALITY) };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'error' };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

async function captureViaDisplayMedia(): Promise<string | null> {
  const result = await captureViaDisplayMediaDetailed();
  return result.ok ? result.dataUrl : null;
}

async function captureDomScreenshot(mode: 'viewport' | 'fullpage'): Promise<string | null> {
  const target = getDomCaptureTarget();
  try {
    await waitBeforeDomCapture();
    await waitForNextPaint();
    const { domToJpeg } = await loadScreenshotModule();
    return await domToJpeg(target, buildDomCaptureOptions(mode));
  } catch (error) {
    console.error('ReportProblemService: DOM screenshot failed', error);
    return null;
  }
}

export class ReportProblemService {
  static warmupScreenshotCapture(): void {
    void loadScreenshotModule();
  }

  static async loadConfig(
    apiCall: (url: string, options?: RequestInit) => Promise<Response>,
  ): Promise<SupportReportPublicConfig> {
    if (cachedConfig) return cachedConfig;
    try {
      const response = await apiCall('/api/support-reports/config');
      if (response.ok) {
        const json = await response.json();
        if (json.data) {
          cachedConfig = { ...DEFAULT_CONFIG, ...json.data };
          ClientLogBuffer.configure({
            maxLines: cachedConfig.clientLogLines,
            levels: cachedConfig.clientLogLevels,
          });
          return cachedConfig;
        }
      }
    } catch {
      // fallback to defaults
    }
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }

  static getConfig(): SupportReportPublicConfig {
    return cachedConfig ?? DEFAULT_CONFIG;
  }

  /**
   * Основний сценарій: спочатку native (швидко + pixel-perfect),
   * якщо недоступно або скасовано — fallback на DOM viewport.
   */
  static async captureScreenshotDefault(): Promise<ScreenshotCaptureResult> {
    if (isNativeCaptureAvailable()) {
      const native = await captureViaDisplayMediaDetailed();
      if (native.ok) {
        return { dataUrl: native.dataUrl, mode: 'native' };
      }
      if (native.reason === 'cancelled') {
        const viewport = await captureDomScreenshot('viewport');
        return { dataUrl: viewport, mode: 'viewport', nativeCancelled: true };
      }
    }

    const viewport = await captureDomScreenshot('viewport');
    return { dataUrl: viewport, mode: 'viewport' };
  }

  static async captureScreenshot(
    mode: ScreenshotCaptureMode = 'viewport',
  ): Promise<string | null> {
    if (mode === 'native') {
      return captureViaDisplayMedia();
    }
    return captureDomScreenshot(mode === 'fullpage' ? 'fullpage' : 'viewport');
  }

  static buildMetadata(user: ReportUser | null): SupportReportPayload['metadata'] {
    const { href, pathname, search } = window.location;
    const orderMatch = href.match(/\/orders\/([^/?#]+)/i);

    return {
      url: href,
      pathname,
      search,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown',
      orderNumber: orderMatch?.[1],
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name,
      userRole: user?.role,
    };
  }

  static async submitReport(
    apiCall: (url: string, options?: RequestInit) => Promise<Response>,
    params: {
      comment: string;
      screenshotBase64?: string | null;
      user: ReportUser | null;
    },
  ): Promise<SupportReportResponse> {
    const config = ReportProblemService.getConfig();
    let screenshotBase64 = params.screenshotBase64 || undefined;

    if (screenshotBase64) {
      try {
        screenshotBase64 = await compressScreenshotIfNeeded(
          screenshotBase64,
          config.maxScreenshotMb,
        );
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Скриншот занадто великий',
        };
      }
    }

    const payload: SupportReportPayload = {
      comment: params.comment.trim(),
      screenshotBase64,
      metadata: ReportProblemService.buildMetadata(params.user),
      clientLogs: ClientLogBuffer.getLogs(),
    };

    const response = await apiCall('/api/support-reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    let json: SupportReportResponse = { success: false };
    try {
      json = (await response.json()) as SupportReportResponse;
    } catch {
      if (response.status === 413) {
        return {
          success: false,
          error: 'Запит занадто великий. Спробуйте зменшити вікно браузера або надіслати без скриншота.',
        };
      }
      return { success: false, error: 'Не вдалося надіслати звіт' };
    }

    if (!response.ok) {
      return {
        success: false,
        error: json.error || 'Не вдалося надіслати звіт',
      };
    }
    return json;
  }
}
