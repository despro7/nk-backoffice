import { PORTION_LABEL_CANVAS_PX } from '../constants/productLabelPortionStatic.js';

/** Figma-макет 432×432 → друк 288×288 pt (масштаб 1.5× у Figma). */
export const PORTION_LABEL_FIGMA_SCALE = 1.5;

export const PORTION_LABEL_PDF_SIZE_PT = PORTION_LABEL_CANVAS_PX;

/** Переводить px з Figma (432) у px макету (288). */
export function portionFigmaPx(figmaPx: number): number {
  return figmaPx / PORTION_LABEL_FIGMA_SCALE;
}

export function portionTitleFontSize(lineFontSize: number, maxPx: number): number {
  return Math.max(11, Math.round((lineFontSize / 14) * maxPx));
}

/** Розміри заголовка з Figma node 2062:2946. */
export const PORTION_TITLE_LINE1_MAX_PX = portionFigmaPx(31.824);
export const PORTION_TITLE_LINE2_MAX_PX = portionFigmaPx(22.953);

export const PORTION_LABEL_LAYOUT = {
  padX: portionFigmaPx(10),
  padTop: portionFigmaPx(9),
  padBottom: portionFigmaPx(41),
  headerGap: portionFigmaPx(3),
  logoSize: portionFigmaPx(66),
  qrSize: portionFigmaPx(56.115),
  titleWidth: portionFigmaPx(272),
  bodyGap: portionFigmaPx(16),
  instructionWidth: portionFigmaPx(183),
  instructionHeight: portionFigmaPx(165),
  /** Відступ між інструкцією та текстовою колонкою (за рахунок ширини колонки). */
  instructionTextGap: portionFigmaPx(14),
  infoColumnWidth: portionFigmaPx(208),
  infoColumnGap: portionFigmaPx(10),
  nutritionGap: portionFigmaPx(6),
  nutritionLineGap: portionFigmaPx(1),
  batchGap: portionFigmaPx(4),
  bottomRowWidth: portionFigmaPx(334),
  manufacturerWidth: portionFigmaPx(105),
  addressWidth: portionFigmaPx(96),
  estimatedSize: portionFigmaPx(28),
  /** Відступ штрихкоду від правого краю (Figma px). */
  barcodeRight: portionFigmaPx(16),
  barcodeWidth: portionFigmaPx(67),
  barcodeHeight: portionFigmaPx(149),
  barcodeFontSize: portionFigmaPx(54),
  netWeightGap: 1,
  /** Підняти блок ваги, щоб низ збігався з рядком «Сайт: …». */
  netWeightBlockLift: portionFigmaPx(9),
  /** Опустити ℮ відносно значення ваги (translateY, без впливу на висоту рядка). */
  estimatedIconDrop: portionFigmaPx(5),
  warningIconSize: portionFigmaPx(13.5),
  warningFontSize: portionFigmaPx(11.1),
} as const;
