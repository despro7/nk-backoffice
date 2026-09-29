import type { StorefrontPullApplyFlags, WooPullBulkFieldKey } from '@shared/types/storefront';

export type { StorefrontPullApplyFlags };

export type PullFieldKey = keyof StorefrontPullApplyFlags;

export const BULK_PULL_FIELD_KEYS: WooPullBulkFieldKey[] = [
  'name',
  'shortDescription',
  'storefrontDescriptionDoc',
  'productIngredientsJson',
  'productNutritionJson',
  'weight',
  'regularPrice',
  'doNotPublish',
  'category',
  'images',
];

export const BULK_PULL_FIELD_OPTIONS: Array<{
  key: WooPullBulkFieldKey;
  label: string;
  conflictField: string;
}> = [
  { key: 'name', label: 'Назва', conflictField: 'name' },
  { key: 'shortDescription', label: 'Короткий опис', conflictField: 'description' },
  { key: 'storefrontDescriptionDoc', label: 'Storefront doc', conflictField: 'storefrontDescriptionDoc' },
  { key: 'productIngredientsJson', label: 'Склад', conflictField: 'productIngredientsJson' },
  { key: 'productNutritionJson', label: 'КБЖВ', conflictField: 'productNutritionJson' },
  { key: 'weight', label: 'Вага', conflictField: 'weight' },
  { key: 'regularPrice', label: 'Ціна', conflictField: 'regularPrice' },
  { key: 'doNotPublish', label: 'Не публікувати', conflictField: 'doNotPublish' },
  { key: 'category', label: 'Категорія', conflictField: 'category' },
  { key: 'images', label: 'Зображення', conflictField: 'images' },
];

export const PULL_FIELD_OPTIONS: Array<{
  key: PullFieldKey;
  label: string;
  hint: string;
  conflictField?: string;
}> = [
  { key: 'name', label: 'Назва товару', hint: 'name з WooCommerce', conflictField: 'name' },
  {
    key: 'fullDescription',
    label: 'Legacy опис',
    hint: 'Повний HTML з WooCommerce',
    conflictField: 'fullDescription',
  },
  {
    key: 'shortDescription',
    label: 'Короткий опис',
    hint: 'short_description з WC',
    conflictField: 'description',
  },
  {
    key: 'storefrontDescriptionDoc',
    label: 'Storefront doc',
    hint: 'Блоки опису після парсингу',
    conflictField: 'storefrontDescriptionDoc',
  },
  {
    key: 'productIngredientsJson',
    label: 'Склад (tags)',
    hint: 'Теги інгредієнтів',
    conflictField: 'productIngredientsJson',
  },
  {
    key: 'productNutritionJson',
    label: 'КБЖВ',
    hint: 'Нутрієнти з meta / HTML',
    conflictField: 'productNutritionJson',
  },
  { key: 'weight', label: 'Вага', hint: 'Вага товару, кг', conflictField: 'weight' },
  { key: 'regularPrice', label: 'Ціна', hint: 'Роздріб і Звичайна', conflictField: 'regularPrice' },
  {
    key: 'doNotPublish',
    label: 'Не публікувати',
    hint: 'draft/publish статус WC',
    conflictField: 'doNotPublish',
  },
  {
    key: 'category',
    label: 'Категорія',
    hint: 'Оновити категорію на WC за групою в BO',
    conflictField: 'category',
  },
  { key: 'images', label: 'Зображення', hint: 'Імпорт з WooCommerce' },
  { key: 'replaceImages', label: 'Замінити існуючі зображення', hint: 'Видалити локальні перед імпортом' },
  { key: 'wooProductId', label: 'Звʼязати WC ID', hint: 'Зберегти wooProductId' },
];

export function buildBulkApplyFromMatrix(
  fieldFlags: Record<WooPullBulkFieldKey, boolean>,
): StorefrontPullApplyFlags {
  const apply: StorefrontPullApplyFlags = {};
  for (const field of BULK_PULL_FIELD_KEYS) {
    if (fieldFlags[field]) apply[field] = true;
  }
  return apply;
}
