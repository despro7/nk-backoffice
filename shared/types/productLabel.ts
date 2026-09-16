export type ProductLabelKind = 'portion' | 'box';

export type ProductLabelTitleAlign = 'left' | 'center' | 'right';

export interface ProductLabelTitleLayout {
  line1: string;
  line2: string;
  line1FontSize: number;
  line2FontSize: number;
  /** Вирівнювання заголовка на етикетці. */
  align: ProductLabelTitleAlign;
}

export interface ProductLabelPayload {
  labelKind: ProductLabelKind;
  batchId: string;
  batchNumber: string;
  barcode: string;
  title: ProductLabelTitleLayout;
  ingredientsText: string;
  nutritionText: string;
  /** Якщо true — енергетична цінність задана вручну, без автоперерахунку. */
  nutritionEnergyManual?: boolean;
  /** Умови зберігання (редагований текст). */
  storageText: string;
  /** Display text, e.g. "04.2027" */
  expiresAt: string;
  /** e.g. "400г" */
  netWeightLabel: string;
}

export interface ProductLabelDraftDto {
  goodId: string;
  batchId: string;
  labelKind: ProductLabelKind;
  batchNumber: string;
  payload: ProductLabelPayload;
  updatedAt: string;
}

export interface ProductLabelPublishedDto {
  id: number;
  goodId: string;
  batchId: string;
  labelKind: ProductLabelKind;
  batchNumber: string;
  version: number;
  barcode: string;
  pdfFileName: string;
  payload: ProductLabelPayload;
  publishedBy: number | null;
  publishedByName?: string | null;
  publishedAt: string;
}
