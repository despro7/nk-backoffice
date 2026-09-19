import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
  Chip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ScreenshotCaptureMode } from '@shared/types/supportReport';
import {
  isNativeCaptureAvailable,
  REPORT_CAPTURE_EXCLUDE_CLASS,
} from '@/services/ReportProblemService';
import { ScreenshotAnnotator } from '@/components/modals/ScreenshotAnnotator';
import type { ScreenshotStroke } from '@/components/modals/screenshotAnnotatorUtils';

interface ReportProblemModalProps {
  isOpen: boolean;
  screenshot: string | null;
  screenshotMode: ScreenshotCaptureMode;
  maxCommentLength: number;
  isSubmitting: boolean;
  isRecapturing: boolean;
  onClose: () => void;
  onSubmit: (comment: string, screenshot: string | null) => void;
  onRecapture: (mode: ScreenshotCaptureMode) => void;
}

const MODE_LABELS: Record<ScreenshotCaptureMode, string> = {
  native: 'Точний (вкладка)',
  viewport: 'Видимий екран (DOM)',
  fullpage: 'Вся сторінка (DOM)',
};

const nativeAvailable = isNativeCaptureAvailable();

export function ReportProblemModal({
  isOpen,
  screenshot,
  screenshotMode,
  maxCommentLength,
  isSubmitting,
  isRecapturing,
  onClose,
  onSubmit,
  onRecapture,
}: ReportProblemModalProps) {
  const [comment, setComment] = useState('');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [strokes, setStrokes] = useState<ScreenshotStroke[]>([]);
  const [annotatedScreenshot, setAnnotatedScreenshot] = useState<string | null>(null);
  const [annotatorToolbarHost, setAnnotatorToolbarHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setComment('');
      setZoomOpen(false);
      setStrokes([]);
      setAnnotatedScreenshot(null);
      setAnnotatorToolbarHost(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!zoomOpen) {
      setAnnotatorToolbarHost(null);
    }
  }, [zoomOpen]);

  useEffect(() => {
    setStrokes([]);
    setAnnotatedScreenshot(null);
  }, [screenshot]);

  const handleSubmit = () => {
    onSubmit(comment.trim(), annotatedScreenshot ?? screenshot);
  };

  const handleZoomKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setZoomOpen(false);
    }
  }, []);

  const recaptureDisabled = isSubmitting || isRecapturing;
  const previewSrc = annotatedScreenshot ?? screenshot;
  const hasAnnotations = strokes.length > 0;

  return (
    <>
      <Modal
        size="2xl"
        isOpen={isOpen}
        onClose={onClose}
        isDismissable={false}
        scrollBehavior="inside"
        data-report-modal="true"
        classNames={{
          base: `rounded-xl ${REPORT_CAPTURE_EXCLUDE_CLASS}`,
          wrapper: `z-[100000] ${REPORT_CAPTURE_EXCLUDE_CLASS}`,
          backdrop: `z-[100000] ${REPORT_CAPTURE_EXCLUDE_CLASS}`,
          closeButton: 'top-3 right-3',
        }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
            <DynamicIcon name="alert-triangle" size={20} className="text-danger" />
            Сповістити адміністратора про проблему
          </ModalHeader>
          <ModalBody className="gap-4">
            <Textarea
              label="Опишіть проблему"
              variant="faded"
              classNames={{
                inputWrapper: 'border-1',
                input: 'placeholder:opacity-50',
              }}
              placeholder="Що сталося? Які кроки призвели до помилки?"
              value={comment}
              onValueChange={setComment}
              maxLength={maxCommentLength}
              minRows={3}
            />

            <div className="space-y-2 mt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-default-500">
                  Превʼю скриншота: <span className="font-semibold">{MODE_LABELS[screenshotMode]}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {nativeAvailable ? (
                    <Button
                      size="sm"
                      variant="flat"
                      isDisabled={recaptureDisabled}
                      onPress={() => onRecapture('native')}
                      startContent={
                        isRecapturing && screenshotMode === 'native' ? (
                          <DynamicIcon name="loader-circle" size={14} className="animate-spin" />
                        ) : (
                          <DynamicIcon name="scan" size={14} />
                        )
                      }
                    >
                      Точний
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="flat"
                    isDisabled={recaptureDisabled}
                    onPress={() => onRecapture('viewport')}
                    startContent={
                      isRecapturing && screenshotMode === 'viewport' ? (
                        <DynamicIcon name="loader-circle" size={14} className="animate-spin" />
                      ) : (
                        <DynamicIcon name="monitor" size={14} />
                      )
                    }
                  >
                    Екран
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    isDisabled={recaptureDisabled}
                    onPress={() => onRecapture('fullpage')}
                    startContent={
                      isRecapturing && screenshotMode === 'fullpage' ? (
                        <DynamicIcon name="loader-circle" size={14} className="animate-spin" />
                      ) : (
                        <DynamicIcon name="scroll-text" size={14} />
                      )
                    }
                  >
                    Вся сторінка
                  </Button>
                </div>
              </div>

              {screenshot ? (
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  className="group relative w-full cursor-zoom-in overflow-hidden rounded-lg border border-default-200 bg-content1 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                  aria-label="Збільшити превʼю скриншота"
                >
                  <img
                    src={previewSrc ?? screenshot}
                    alt="Превʼю скриншота"
                    className="w-full max-h-48 object-contain transition-transform duration-300 group-hover:scale-[1.05]"
                  />
                  {hasAnnotations ? (
                    <Chip
                      size="sm"
                      color="danger"
                      variant="flat"
                      className="absolute top-2 left-2 z-10"
                      startContent={<DynamicIcon name="pen-line" size={12} />}
                    >
                      Є позначки
                    </Chip>
                  ) : null}
                  <span className="pointer-events-none absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs text-white">
                    <DynamicIcon name="zoom-in" size={14} />
                    Збільшити
                  </span>
                </button>
              ) : (
                <div className="rounded-lg border border-warning-200 bg-warning-50/80 px-3 py-2 text-sm text-warning-700">
                  Не вдалося зробити скриншот. Спробуйте «Точний» або надішліть без зображення.
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter className="gap-2 pb-6">
            <Button variant="light" onPress={onClose} isDisabled={isSubmitting}>
              Скасувати
            </Button>
            <Button
              color="danger"
              onPress={handleSubmit}
              isDisabled={isSubmitting || isRecapturing}
              startContent={
                isSubmitting ? (
                  <DynamicIcon name="loader-circle" size={16} className="animate-spin" />
                ) : (
                  <DynamicIcon name="send" size={16} />
                )
              }
            >
              Надіслати
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={zoomOpen}
        onClose={() => setZoomOpen(false)}
        size="5xl"
        scrollBehavior="inside"
        hideCloseButton={true}
        onKeyDown={handleZoomKeyDown}
        data-report-modal="true"
        classNames={{
          base: `max-w-[95vw] max-h-[92vh] ${REPORT_CAPTURE_EXCLUDE_CLASS}`,
          wrapper: 'z-[100001]',
          backdrop: `z-[100001] bg-black/80 ${REPORT_CAPTURE_EXCLUDE_CLASS}`,
          closeButton: 'z-10 text-white hover:bg-white/10',
        }}
      >
        <ModalContent className="flex max-h-[92vh] flex-col">
          <ModalHeader className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 ">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold">
              <DynamicIcon name="zoom-in" size={18} className="shrink-0 text-danger" />
              <span className="min-w-0">Скриншот — перегляд і позначки</span>
            </div>
            <div
              ref={setAnnotatorToolbarHost}
              className="flex min-w-[min(100%,20rem)] flex-1 flex-wrap items-center justify-end gap-1.5 sm:flex-none sm:justify-end"
            />
          </ModalHeader>
          <ModalBody className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
            <div className="flex min-h-0 flex-1 flex-col">
              {screenshot ? (
                <ScreenshotAnnotator
                  src={screenshot}
                  strokes={strokes}
                  onStrokesChange={setStrokes}
                  onAnnotatedChange={setAnnotatedScreenshot}
                  layout="fullscreen"
                  toolbarContainer={annotatorToolbarHost}
                />
              ) : null}
            </div>
          </ModalBody>
          <ModalFooter className="shrink-0 border-t border-white/10">
            <Button color="primary" onPress={() => setZoomOpen(false)}>
              Готово
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
