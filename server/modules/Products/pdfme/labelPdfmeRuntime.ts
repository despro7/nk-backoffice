import fs from 'fs/promises';
import path from 'path';
import { generate } from '@pdfme/generator';
import type { Font, Template } from '@pdfme/common';
import type { LabelInputMap } from '../../../../shared/constants/labelInputKeys.js';
import type { LabelPdfmeTemplate } from '../../../../shared/types/labelTemplate.js';
import { createLabelPdfmePlugins } from '../../../../shared/pdfme/labelPdfmePlugins.js';
import { prepareLabelTemplateForRender } from '../../../../shared/pdfme/prepareLabelTemplate.js';
import { resolvePdfmeInputs } from '../../../../shared/utils/labelTemplateInputs.js';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

let fontCache: Font | null = null;

export async function loadLabelPdfmeFonts(): Promise<Font> {
  if (fontCache) return fontCache;
  const [regular, bold, daysOne, condensed] = await Promise.all([
    fs.readFile(path.join(FONTS_DIR, 'ArialRegular.ttf')),
    fs.readFile(path.join(FONTS_DIR, 'ArialBold.ttf')),
    fs.readFile(path.join(FONTS_DIR, 'DaysOne-Regular.ttf')),
    fs.readFile(path.join(FONTS_DIR, 'OpenSansCondensed-Bold.ttf')),
  ]);
  fontCache = {
    Arial: { data: new Uint8Array(regular), fallback: true, subset: false },
    ArialBold: { data: new Uint8Array(bold), subset: false },
    DaysOne: { data: new Uint8Array(daysOne), subset: false },
    OpenSansCondensed: { data: new Uint8Array(condensed), subset: false },
  };
  return fontCache;
}

async function readPublicSvg(name: string): Promise<string> {
  try {
    return await fs.readFile(path.join(PUBLIC_DIR, name), 'utf8');
  } catch {
    return '';
  }
}

/** SVG-ассети, які шаблон очікує в inputs. */
export async function loadLabelSvgInputs(): Promise<{
  logo_svg: string;
  instruction_svg: string;
  estimated_svg: string;
  warning_icon: string;
  qr_url: string;
}> {
  const [logo_svg, instruction_svg, estimated_svg, warning_icon, qr_url] = await Promise.all([
    readPublicSvg('nk-food-logo.svg'),
    readPublicSvg('portion-instruction.svg'),
    readPublicSvg('estimated.svg'),
    readPublicSvg('icon-warning.svg'),
    readPublicSvg('qr-code-nk.svg'),
  ]);
  return { logo_svg, instruction_svg, estimated_svg, warning_icon, qr_url };
}

export async function generateLabelPdfBuffer(
  template: Template,
  logicalInputs: Partial<LabelInputMap>,
): Promise<Buffer> {
  const font = await loadLabelPdfmeFonts();
  const renderTemplate = prepareLabelTemplateForRender(template as LabelPdfmeTemplate);
  const pdfmeInputs = resolvePdfmeInputs(renderTemplate, logicalInputs);
  const pdf = await generate({
    template: renderTemplate as Template,
    inputs: [pdfmeInputs],
    plugins: createLabelPdfmePlugins(),
    options: { font },
  });
  return Buffer.from(pdf);
}
