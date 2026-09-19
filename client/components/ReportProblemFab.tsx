import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useApi } from '@/hooks/useApi';
import {
  ReportProblemService,
  isNativeCaptureAvailable,
  REPORT_CAPTURE_EXCLUDE_CLASS,
  setReportCaptureUiHidden,
} from '@/services/ReportProblemService';
import type { ScreenshotCaptureMode } from '@shared/types/supportReport';
import { ReportProblemModal } from '@/components/modals/ReportProblemModal';
import { ToastService } from '@/services/ToastService';
import { useIsMobile } from '@/hooks/useTouchUi';

const TAB_WIDTH_COLLAPSED = 16;
const TAB_WIDTH_EXPANDED = 20;

const DESKTOP_DOCK_PLACEMENT_CLASS = 'left-0 items-start bottom-24 lg:bottom-12';

export function ReportProblemFab() {
  const { user } = useAuth();
  const { apiCall } = useApi();
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();

  const [expanded, setExpanded] = useState(false);
  const [tabHovered, setTabHovered] = useState(false);
  const mainButtonRef = useRef<HTMLDivElement>(null);
  const [mainButtonWidth, setMainButtonWidth] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotMode, setScreenshotMode] = useState<ScreenshotCaptureMode>('native');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecapturing, setIsRecapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [config, setConfig] = useState(ReportProblemService.getConfig());

  useEffect(() => {
    void ReportProblemService.loadConfig(apiCall).then(setConfig);
  }, [apiCall]);

  useEffect(() => {
    if (expanded) {
      ReportProblemService.warmupScreenshotCapture();
    }
  }, [expanded]);

  useLayoutEffect(() => {
    const node = mainButtonRef.current;
    if (!node) return;

    const measure = () => setMainButtonWidth(node.offsetWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isCapturing]);

  const captureScreenshot = useCallback(async (mode: ScreenshotCaptureMode) => {
    const dataUrl = await ReportProblemService.captureScreenshot(mode);
    setScreenshot(dataUrl);
    setScreenshotMode(mode);
    return dataUrl;
  }, []);

  const handleReportClick = useCallback(async () => {
    setIsCapturing(true);
    setExpanded(false);
    setReportCaptureUiHidden(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const result = await ReportProblemService.captureScreenshotDefault();
      setScreenshot(result.dataUrl);
      setScreenshotMode(result.mode);
      if (result.nativeCancelled) {
        ToastService.show({
          title: 'Скриншот вкладки скасовано',
          description: 'Використано захоплення видимого екрана (DOM)',
          color: 'warning',
        });
      }
      setModalOpen(true);
    } finally {
      setReportCaptureUiHidden(false);
      setIsCapturing(false);
    }
  }, []);

  const handleRecapture = useCallback(
    async (mode: ScreenshotCaptureMode) => {
      setIsRecapturing(true);
      const needsCleanPage = mode === 'viewport' || mode === 'fullpage' || mode === 'native';
      try {
        if (needsCleanPage) {
          setModalOpen(false);
          setReportCaptureUiHidden(true);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        await captureScreenshot(mode);
        if (needsCleanPage) {
          setReportCaptureUiHidden(false);
          setModalOpen(true);
        }
      } finally {
        setIsRecapturing(false);
      }
    },
    [captureScreenshot],
  );

  const handleSubmit = useCallback(
    async (comment: string, screenshotToSend: string | null) => {
      setIsSubmitting(true);
      try {
        const result = await ReportProblemService.submitReport(apiCall, {
          comment,
          screenshotBase64: screenshotToSend,
          user,
        });

        if (result.success) {
          ToastService.show({
            title: 'Надіслано адміну',
            description: result.message || 'Дякуємо за звіт',
            color: 'success',
          });
          setModalOpen(false);
          setScreenshot(null);
        } else {
          ToastService.show({
            title: 'Помилка',
            description: result.error || 'Не вдалося надіслати звіт',
            color: 'danger',
          });
        }
      } catch {
        ToastService.show({
          title: 'Помилка',
          description: 'Не вдалося надіслати звіт',
          color: 'danger',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [apiCall, screenshot, user],
  );

  if (!user || isMobile) return null;

  const tabWidth =
    expanded || tabHovered ? TAB_WIDTH_EXPANDED : TAB_WIDTH_COLLAPSED;
  const slideTransition = { duration: reduceMotion ? 0 : 0.28, ease: 'easeInOut' as const };
  const showMainButton = expanded || isCapturing;
  const railWidth = showMainButton
    ? mainButtonWidth > 0
      ? tabWidth + mainButtonWidth
      : 'auto'
    : tabWidth;
  const railOffset =
    showMainButton || mainButtonWidth === 0 ? 0 : -mainButtonWidth;

  return (
    <>
      <div
        data-report-fab="true"
        className={cn(
          'fixed z-[99999] flex items-center transition-opacity duration-150',
          DESKTOP_DOCK_PLACEMENT_CLASS,
          REPORT_CAPTURE_EXCLUDE_CLASS,
        )}
      >
        <motion.div
          className="overflow-hidden rounded-r-md shadow-lg"
          initial={false}
          animate={{ width: railWidth }}
          transition={slideTransition}
        >
          <motion.div
            className="flex w-max items-stretch"
            initial={false}
            animate={{ x: railOffset }}
            transition={slideTransition}
          >
            <div ref={mainButtonRef} className="shrink-0">
              <Button
                color="danger"
                disableAnimation
                className={cn(
                  'h-12 rounded-none px-4 font-semibold whitespace-nowrap opacity-100! transition-colors!',
                  'data-[pressed=true]:scale-100 data-[hover=true]:bg-danger-400',
                  'active:bg-danger-500 data-[pressed=true]:bg-danger-500',
                )}
                onPress={handleReportClick}
                isDisabled={isCapturing}
                startContent={<DynamicIcon name="alert-triangle" size={18} />}
              >
                {isCapturing ? 'Роблю скриншот…' : 'Сповістити адміна'}
              </Button>
            </div>

            <motion.button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? 'Згорнути кнопку звіту' : 'Розгорнути кнопку звіту'}
              onClick={() => !isCapturing && setExpanded((v) => !v)}
              onMouseEnter={() => setTabHovered(true)}
              onMouseLeave={() => setTabHovered(false)}
              animate={{ width: tabWidth }}
              transition={slideTransition}
              disabled={isCapturing}
              className={cn(
                'flex h-12 shrink-0 items-center justify-center bg-danger-500 text-danger-50',
                'hover:bg-danger-400 active:bg-danger-500 transition-colors',
                showMainButton && 'border-l border-danger-700/40',
                isCapturing && 'cursor-wait',
              )}
            >
              <DynamicIcon
                name={expanded ? 'chevron-left' : 'chevron-right'}
                size={15}
                className="shrink-0 opacity-90"
              />
            </motion.button>
          </motion.div>
        </motion.div>
      </div>

      <ReportProblemModal
        isOpen={modalOpen}
        screenshot={screenshot}
        screenshotMode={screenshotMode}
        maxCommentLength={config.maxCommentLength}
        isSubmitting={isSubmitting}
        isRecapturing={isRecapturing}
        onClose={() => {
          if (!isSubmitting) {
            setModalOpen(false);
            setScreenshot(null);
            setScreenshotMode(isNativeCaptureAvailable() ? 'native' : 'viewport');
          }
        }}
        onSubmit={handleSubmit}
        onRecapture={handleRecapture}
      />
    </>
  );
}
