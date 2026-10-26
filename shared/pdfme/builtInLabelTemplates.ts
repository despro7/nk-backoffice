import type { Template } from '@pdfme/common';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import {
  PORTION_LABEL_LAYOUT,
  PORTION_TITLE_LINE1_MAX_PX,
  PORTION_TITLE_LINE2_MAX_PX,
  portionFigmaPx,
} from '../utils/productLabelPortionLayout.js';
import { PORTION_LABEL_STATIC } from '../constants/productLabelPortionStatic.js';
import {
  LABEL_MVT_DESIGNER_SAMPLE,
  parseMvtVariableNames,
  pickMvtVariablePayload,
} from '../utils/labelMvtVariables.js';

type Field = Record<string, unknown>;

/** 288 px макету = 100 мм наліпки. */
const PX_TO_MM = 100 / 288;

function mm(canvasPx: number): number {
  return Math.round(canvasPx * PX_TO_MM * 100) / 100;
}

const L = PORTION_LABEL_LAYOUT;

/** Зразковий текст як на робочій наліпці «Печеня зі свининою». */
export const LABEL_DESIGNER_SAMPLE: Record<string, string> = {
  title_line1: 'Печеня',
  title_line2: 'зі свининою',
  ingredients:
    'Склад: картопля свіжа, м’ясо свинини, цибуля ріпчаста свіжа, олія соняшникова, морква свіжа, сіль кухонна харчова, перець чорний мелений, паприка мелена, кріп сушений, коріандр, чебрець, часникова есенція',
  nutrition_header: PORTION_LABEL_STATIC.nutritionHeader,
  nutrition_proteins: 'Білки 6г',
  nutrition_fats: 'Жири 7г',
  nutrition_carbs: 'Вуглеводи 9г',
  nutrition_energy: 'Енергетична цінність 123 ккал',
  nutrition_salt: '',
  storage: PORTION_LABEL_STATIC.storageText,
  batch_number: `${PORTION_LABEL_STATIC.batchLabel} 61007`,
  expires_at: `${PORTION_LABEL_STATIC.expiryLabel} 09.2027`,
  net_weight_label: PORTION_LABEL_STATIC.netWeightLabel,
  net_weight: '380 г',
  main_product_weight: '',
  manufacturer: 'Виробник:\nТОВ «Нова Кухня»\nЕлектронна адреса:\ninfo@nk-food.shop\nСайт: nk-food.shop',
  address: 'Адреса потужностей\nвиробництва:\n07101, Київська обл,\nм. Славутич, пр-т\nЕнтузіастів, 8',
  warning: PORTION_LABEL_STATIC.warning.toUpperCase(),
  barcode: '2200000001696',
};

const SVG_CONTENT_FIELDS = new Set([
  'logo_svg',
  'instruction_svg',
  'estimated_svg',
  'warning_icon',
  'qr_url',
]);

function text(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  extra: Field = {},
): Field {
  return {
    name,
    type: 'text',
    content: LABEL_DESIGNER_SAMPLE[name] ?? '',
    position: { x, y },
    width,
    height,
    fontSize,
    lineHeight: 1.05,
    characterSpacing: 0,
    fontName: 'Arial',
    alignment: 'left',
    verticalAlignment: 'top',
    fontColor: '#000000',
    backgroundColor: '',
    ...extra,
  };
}

/** Базовий бланк 100×100 мм. */
export const LABEL_BASE_PDF = {
  width: 100,
  height: 100,
  padding: [0, 0, 0, 0] as [number, number, number, number],
};

/**
 * Пресет «Порція» за макетом react-pdf / Figma (288 px → 100 мм).
 */
export function buildPortionLabelTemplate(): LabelPdfmeTemplate {
  const x0 = mm(L.padX);
  const y0 = mm(L.padTop);
  const logo = mm(L.logoSize);
  const qr = mm(L.qrSize);
  const qrX = 100 - x0 - qr;
  const titleW = Math.min(mm(L.titleWidth), qrX - (x0 + logo) - 1);
  const titleX = x0 + logo + Math.max(0.4, (qrX - (x0 + logo) - titleW) / 2);
  const title1 = Math.round(PORTION_TITLE_LINE1_MAX_PX);
  const title2 = Math.round(PORTION_TITLE_LINE2_MAX_PX);

  const ingredientsY = y0 + logo + mm(7);
  const ingredientsH = 11;
  const instructionY = ingredientsY + ingredientsH + mm(L.bodyGap);
  const instructionW = mm(L.instructionWidth);
  const instructionH = mm(L.instructionHeight);
  const infoX = x0 + instructionW + mm(L.instructionTextGap);
  const infoW = Math.min(mm(L.infoColumnWidth), 100 - infoX - mm(L.barcodeWidth) - 1);

  const headerH = 4.2;
  const lineH = 3.5;
  let y = instructionY;
  const nutritionHeaderY = y;
  y += headerH + mm(L.nutritionGap);
  const proteinsY = y;
  y += lineH;
  const fatsY = y;
  y += lineH;
  const carbsY = y;
  y += lineH;
  const energyY = y;
  y += lineH + mm(L.infoColumnGap);
  const storageY = y;
  const storageH = 14;
  y += storageH + mm(L.infoColumnGap);
  const batchY = y;
  const expiryY = y + 5;

  const warningH = mm(portionFigmaPx(6) + portionFigmaPx(9)) + 2.2;
  const warningY = 100 - warningH;
  const bottomTop = warningY - mm(L.bottomRowReserve) + 4;
  const weightX = x0;
  const manufacturerX = weightX + 30;
  const addressX = manufacturerX + mm(L.manufacturerWidth) + 2;

  const barcodeW = mm(L.barcodeHeight);
  const barcodeH = mm(L.barcodeWidth);
  const barcodeX = 100 - mm(L.barcodeRight) - barcodeH;
  const barcodeY = mm(portionFigmaPx(277.63));

  const page: Field[] = [
    {
      name: 'logo_svg',
      type: 'svg',
      position: { x: x0, y: y0 },
      width: logo,
      height: logo,
    },
    text('title_line1', titleX, y0 + 1.2, titleW, 8.2, title1, {
      alignment: 'center',
      fontName: 'DaysOne',
      verticalAlignment: 'middle',
    }),
    text('title_line2', titleX, y0 + 8.6, titleW, 6.4, title2, {
      alignment: 'center',
      fontName: 'DaysOne',
      verticalAlignment: 'middle',
    }),
    {
      name: 'qr_url',
      type: 'svg',
      position: { x: qrX, y: y0 + (logo - qr) / 2 },
      width: qr,
      height: qr,
    },
    text('ingredients', x0, ingredientsY, 100 - x0 * 2, ingredientsH, 8, {
      fontName: 'Arial',
      lineHeight: 1.12,
    }),
    {
      name: 'instruction_svg',
      type: 'svg',
      position: { x: x0, y: instructionY },
      width: instructionW,
      height: instructionH,
    },
    text('nutrition_header', infoX, nutritionHeaderY, infoW, headerH, 7.3, { fontName: 'ArialBold' }),
    text('nutrition_proteins', infoX, proteinsY, infoW, lineH, 6.7),
    text('nutrition_fats', infoX, fatsY, infoW, lineH, 6.7),
    text('nutrition_carbs', infoX, carbsY, infoW, lineH, 6.7),
    text('nutrition_energy', infoX, energyY, infoW, lineH, 6.7),
    text('storage', infoX, storageY, infoW, storageH, 6.7, { lineHeight: 1.05 }),
    text('batch_number', infoX, batchY, infoW, 4.6, 9.3, { fontName: 'ArialBold', lineHeight: 1 }),
    text('expires_at', infoX, expiryY, infoW, 4.6, 9.3, { fontName: 'ArialBold', lineHeight: 1 }),
    text('net_weight_label', weightX, bottomTop, 28, 5, 14, {
      fontName: 'OpenSansCondensed',
      lineHeight: 1,
    }),
    text('net_weight', weightX, bottomTop + 5, 20, 8.5, 22, {
      fontName: 'OpenSansCondensed',
      lineHeight: 0.9,
    }),
    {
      name: 'estimated_svg',
      type: 'svg',
      position: { x: weightX + 20.5, y: bottomTop + 6.2 },
      width: mm(L.estimatedSize),
      height: mm(L.estimatedSize),
    },
    text('manufacturer', manufacturerX, bottomTop + 1, mm(L.manufacturerWidth), 16, 6, { lineHeight: 1.17 }),
    text('address', addressX, bottomTop + 1, mm(L.addressWidth), 16, 6, { lineHeight: 1.17 }),
    {
      name: 'warning_icon',
      type: 'svg',
      position: { x: mm(portionFigmaPx(12)), y: warningY + 1.3 },
      width: mm(L.warningIconSize),
      height: mm(L.warningIconSize),
    },
    text('warning', mm(portionFigmaPx(12)) + mm(L.warningIconSize) + mm(L.headerGap), warningY, 68, warningH, L.warningFontSize, {
      fontName: 'OpenSansCondensed',
      fontColor: '#ffffff',
      backgroundColor: '#000000',
      verticalAlignment: 'middle',
      lineHeight: 1,
    }),
    {
      name: 'barcode',
      type: 'ean13',
      content: LABEL_DESIGNER_SAMPLE.barcode,
      position: { x: barcodeX, y: barcodeY },
      width: barcodeW,
      height: barcodeH,
      rotate: 90,
    },
  ];

  return { basePdf: LABEL_BASE_PDF, schemas: [page] };
}

const ASSET_FIELDS = SVG_CONTENT_FIELDS;

/** pdfme Template має optional basePdf; для нашого контракту завжди підставляємо 100×100 мм. */
export function toLabelPdfmeTemplate(raw: Template | LabelPdfmeTemplate): LabelPdfmeTemplate {
  const out: LabelPdfmeTemplate = {
    basePdf: raw.basePdf ?? LABEL_BASE_PDF,
    schemas: (raw.schemas ?? []) as LabelPdfmeTemplate['schemas'],
  };
  if (Array.isArray(raw.columns)) {
    out.columns = raw.columns;
  }
  if (Array.isArray(raw.sampledata)) {
    out.sampledata = raw.sampledata as LabelPdfmeTemplate['sampledata'];
  }
  if (typeof raw.pdfmeVersion === 'string') {
    out.pdfmeVersion = raw.pdfmeVersion;
  }
  return out;
}

/**
 * Підставляє зразковий текст і SVG, якщо в збереженому шаблоні їх ще немає.
 * SVG-поля оновлює завжди: інакше в рамці лишається URL замість картинки.
 */
export function hydrateLabelTemplateContent(
  template: LabelPdfmeTemplate,
  assets: Partial<Record<string, string>> = {},
): LabelPdfmeTemplate {
  return {
    ...template,
    schemas: (template.schemas ?? []).map((page) =>
      page.map((field) => {
        const name = String(field.name ?? '');
        const current = typeof field.content === 'string' ? field.content.trim() : '';
        const sample = LABEL_DESIGNER_SAMPLE[name] ?? '';
        const next: Field = { ...field };
        if (ASSET_FIELDS.has(name) && assets[name]) {
          next.content = assets[name];
          next.type = 'svg';
        } else if (next.type === 'multiVariableText') {
          const text =
            typeof next.text === 'string' && next.text.trim()
              ? next.text
              : (sample || 'Текст з {kcal}');
          next.text = text;
          const varNames = parseMvtVariableNames(text);
          if (varNames.length > 0) {
            next.variables = varNames;
            const payload = pickMvtVariablePayload(varNames, LABEL_MVT_DESIGNER_SAMPLE);
            next.content = JSON.stringify(payload);
          } else if (!current) {
            next.content = '{}';
          }
        } else if (!current && sample) {
          next.content = sample;
        }
        if (next.type === 'text') {
          next.lineHeight = next.lineHeight ?? 1.05;
          next.characterSpacing = next.characterSpacing ?? 0;
          next.fontColor = next.fontColor ?? '#000000';
          next.fontName = next.fontName ?? 'Arial';
        }
        return next;
      }),
    ),
  };
}

/** Коробка — той самий каркас, без другої лінії заголовка. */
export function buildBoxLabelTemplate(): LabelPdfmeTemplate {
  const portion = buildPortionLabelTemplate();
  return {
    ...portion,
    schemas: portion.schemas.map((page) =>
      page.map((field) => (field.name === 'title_line2' ? { ...field, content: '' } : field)),
    ),
  };
}
