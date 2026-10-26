import { useEffect, useMemo, useRef } from 'react';
import { Viewer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import type { LabelInputMap } from '@shared/constants/labelInputKeys';
import type { LabelPdfmeTemplate } from '@shared/types/labelTemplate';
import { createLabelPdfmePlugins } from '@shared/pdfme/labelPdfmePlugins';
import { prepareLabelTemplateForRender } from '@shared/pdfme/prepareLabelTemplate';
import { resolvePdfmeInputs } from '@shared/utils/labelTemplateInputs';
import { loadClientLabelFonts } from '@/pages/Settings/labelTemplates/labelPdfmeFonts';

interface LabelPdfmeViewerProps {
  template: Template | null;
  inputs: Record<string, string>;
}

export function LabelPdfmeViewer({ template, inputs }: LabelPdfmeViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputsKey = JSON.stringify(inputs);
  const renderTemplate = useMemo(
    () => (template ? prepareLabelTemplateForRender(template as LabelPdfmeTemplate) : null),
    [template],
  );

  const pdfmeInputsKey = useMemo(() => {
    if (!renderTemplate) return '';
    return JSON.stringify(resolvePdfmeInputs(renderTemplate, inputs as LabelInputMap));
  }, [renderTemplate, inputsKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !renderTemplate) return;
    let viewer: Viewer | null = null;
    let cancelled = false;

    void loadClientLabelFonts().then((font) => {
      if (cancelled || !hostRef.current) return;
      viewer = new Viewer({
        domContainer: hostRef.current,
        template: renderTemplate as Template,
        inputs: [JSON.parse(pdfmeInputsKey) as Record<string, string>],
        plugins: createLabelPdfmePlugins(),
        options: { font },
      });
    });

    return () => {
      cancelled = true;
      viewer?.destroy();
    };
  }, [renderTemplate, pdfmeInputsKey]);

  if (!template) {
    return (
      <p className="py-8 text-center text-sm text-default-500">
        Для цього типу наліпки ще немає шаблону.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[640px] overflow-hidden rounded-lg border border-default-200">
      <div ref={hostRef} className="aspect-square w-full" />
    </div>
  );
}
