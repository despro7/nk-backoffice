import Typograf from 'typograf';
import type { ProductLabelPayload } from '../types/productLabel.js';

const NBSP = '\u00A0';

const labelTypograf = new Typograf({ locale: ['uk'] });

/** Нерозривний пробіл між числом і одиницями виміру на етикетках. */
function applyLabelUnitNbsp(text: string): string {
  return text.replace(
    /(\d[\d,.]*)(?<!\u00A0)\s+(годин(?:и|у|а)?|год(?:и|у|а)?|ккал|кг|мг|мл|л|Вт|г)(?=$|[^\p{L}\p{N}])/giu,
    `$1${NBSP}$2`,
  );
}

/** Типографує український текст: неразривні пробіли, лапки, тире тощо. */
export function typographUk(text: string): string {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return text ?? '';

  const result = labelTypograf.execute(text);
  return applyLabelUnitNbsp(result);
}

/** Типографує текстові поля наліпки перед відображенням або експортом у PDF. */
export function typographProductLabelPayload(payload: ProductLabelPayload): ProductLabelPayload {
  return {
    ...payload,
    title: {
      ...payload.title,
      line1: typographUk(payload.title.line1),
      line2: typographUk(payload.title.line2),
    },
    ingredientsText: typographUk(payload.ingredientsText),
    nutritionText: typographUk(payload.nutritionText),
    storageText: typographUk(payload.storageText),
  };
}
