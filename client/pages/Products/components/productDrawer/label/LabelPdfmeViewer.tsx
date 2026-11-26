import { useEffect, useMemo, useRef } from 'react';
import { Viewer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import type { LabelInputMap } from '@shared/constants/labelInputKeys';
import type { LabelPdfmeTemplate } from '@shared/types/labelTemplate';
import { createLabelPdfmePlugins } from '@shared/pdfme/labelPdfmePlugins';
import { prepareLabelTemplateForRender } from '@shared/pdfme/prepareLabelTemplate';
import { resolvePdfmeInputs } from '@shared/utils/labelTemplateInputs';
import type { LabelWeightSpacing } from '@shared/types/labelWeightSpacing';
import { loadClientLabelFonts } from '@/pages/Settings/labelTemplates/labelPdfmeFonts';
import { ensurePdfjsPdfmeConverter } from './pdfjsPdfmeConverter';

/** Початковий масштаб preview (1 = вписати в контейнер). */
const LABEL_VIEWER_ZOOM = 1.25;

interface LabelPdfmeViewerProps {
  template: Template | null;
  inputs: Record<string, string>;
  /** Збережений PDF (base64): показується як є, без рендеру шаблону. */
  pdfBase64?: string | null;
  /** Порційна наліпка: до маси нетто дописується «℮» або похибка «± N». */
  netWeightSuffix?: boolean;
  /** Пробіли в масі нетто з налаштувань шаблону. */
  weightSpacing?: LabelWeightSpacing;
}

export function LabelPdfmeViewer({
  template,
  inputs,
  pdfBase64,
  netWeightSuffix = false,
  weightSpacing,
}: LabelPdfmeViewerProps) {
  const weightSpacingKey = weightSpacing ? JSON.stringify(weightSpacing) : '';
  const hostRef = useRef<HTMLDivElement>(null);
  const inputsKey = JSON.stringify(inputs);
  const renderTemplate = useMemo((): Template | null => {
    if (pdfBase64) {
      ensurePdfjsPdfmeConverter();
      return { basePdf: `data:application/pdf;base64,${pdfBase64}`, schemas: [[]] } as Template;
    }
    return template ? (prepareLabelTemplateForRender(template as LabelPdfmeTemplate) as Template) : null;
  }, [template, pdfBase64]);

  const pdfmeInputsKey = useMemo(() => {
    if (!renderTemplate) return '';
    if (pdfBase64) return '{}';
    return JSON.stringify(
      resolvePdfmeInputs(renderTemplate as LabelPdfmeTemplate, inputs as LabelInputMap, {
        netWeightSuffix,
        weightSpacing: weightSpacingKey
          ? (JSON.parse(weightSpacingKey) as LabelWeightSpacing)
          : undefined,
      }),
    );
  }, [renderTemplate, pdfBase64, inputsKey, netWeightSuffix, weightSpacingKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !renderTemplate) return;
    let viewer: Viewer | null = null;
    let cancelled = false;

    void loadClientLabelFonts().then((font) => {
      if (cancelled || !hostRef.current) return;
      viewer = new Viewer({
        domContainer: hostRef.current,
        template: renderTemplate,
        inputs: [JSON.parse(pdfmeInputsKey) as Record<string, string>],
        plugins: createLabelPdfmePlugins(),
        options: { font, zoomLevel: LABEL_VIEWER_ZOOM },
      });
    });

    return () => {
      cancelled = true;
      viewer?.destroy();
    };
  }, [renderTemplate, pdfmeInputsKey]);

  if (!renderTemplate) {
    return (
      <p className="py-8 text-center text-sm text-default-500">
        Для цього типу наліпки ще немає шаблону.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[640px] overflow-hidden rounded-lg border border-default-200">
      {/* Трохи вища за квадрат + панель масштабу pdfme (inline bottom: 6%) притиснута до низу. */}
      <div
        ref={hostRef}
        className="aspect-[5/5.6] w-full [&_div:has(>.pdfme-ui-control-bar)]:bottom-2!"
      />
    </div>
  );
}
