import { PRODUCT_LABEL_NUTRITION_TEMPLATE } from '../utils/productLabelNutrition.js';

/** Статичні блоки макету наліпки «Порція» (Figma node 2062:1676). */
export const PORTION_LABEL_STATIC = {
  nutritionHeader: 'Поживна цінність на 100г продукту:',
  nutritionTemplate: PRODUCT_LABEL_NUTRITION_TEMPLATE,
  storageText:
    'Зберігати за температури від 0ºС до 25ºС за відносної вологості повітря не більше 75%. У разі відкриття упаковки зберігати в холодильнику не більше 24 годин.',
  netWeightLabel: 'Маса нетто:',
  batchLabel: 'Номер партії:',
  expiryLabel: 'Вжити до:',
  manufacturer: {
    title: 'Виробник:',
    name: '“Нова Кухня”',
    fop: 'ФОП Бубнова М.В.',
    emailLabel: 'Електронна адреса:',
    email: 'info@nk-food.shop',
    siteLabel: 'Сайт:',
    site: 'nk-food.shop',
  },
  address: {
    title: ['Адреса потужностей', 'виробництва:'],
    line: '07101, Київська обл, м. Славутич, пр-т Ентузіастів, 8',
  },
  warning: 'Не розігрівати продукт у мікрохвильовій печі у пакеті',
  instructions: {
    step1: 'Відкрити',
    step2: 'Перекласти у тарілку',
    step3: 'Розігріти у мікрохвильовій печі*',
    step3Note: '* Не розігрівати\n   продукт у пакеті',
    step3Time: '2 хвилини\nW=800Вт',
    step4: 'Можна споживати',
  },
} as const;

/** Розмір макету Figma (px). */
export const PORTION_LABEL_CANVAS_PX = 288;
