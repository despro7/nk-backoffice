import type { IconName } from 'lucide-react/dynamic';
import type {
  CatalogCreateGoodInput,
  CatalogDictionariesDto,
  CatalogGoodDetailDto,
  CatalogTreeItemData,
  CatalogUpdateGoodInput,
  DrawerMode,
} from '../../ProductsTypes';

export interface ProductDrawerProps {
  mode: DrawerMode;
  parentFolderId: string;
  /** Назва батьківської папки для режиму create (коли detail ще немає) */
  parentFolderName?: string | null;
  /** Дерево груп для селекта батьківської папки (create) */
  treeItems?: Record<string, CatalogTreeItemData>;
  detail: CatalogGoodDetailDto | null;
  detailLoading?: boolean;
  dictionaries: CatalogDictionariesDto;
  saving?: boolean;
  onClose: () => void;
  onCreate: (input: CatalogCreateGoodInput) => void | Promise<unknown>;
  onUpdate: (
    id: string,
    input: CatalogUpdateGoodInput,
    opts?: { keepOpen?: boolean }
  ) => void | Promise<unknown>;
  /** Відновити зі смітника (вибір папки ззовні) */
  onRestore?: (id: string) => void;
  catalogSearch: (
    q: string,
    opts?: { underFolderName?: string }
  ) => Promise<CatalogSearchHit[]>;
  onLegacyUpdate?: (id: string) => void;
  legacyUpdating?: boolean;
  /** Глибина вкладеного drawer (GTM-стек) */
  stackLevel?: number;
  /** Id карток у відкритому стеку — щоб не відкривати ту саму двічі */
  stackGoodIds?: string[];
}

export interface CatalogSearchHit {
  id: string;
  name: string;
  sku: string | null;
  weight?: number | null;
  accPolicyId?: string | null;
}

export interface BomRow {
  componentGoodId: string;
  componentName: string;
  componentSku: string | null;
  qty: number;
  /** Од. виміру рядка (для специфікації продукції; у комплекті зазвичай = mainUnit) */
  unitId: string;
  /** Примітка рядка специфікації ↔ Dilovod tpGoods.remark */
  note: string;
  /** Вага компонента з картки, кг */
  componentWeight: number | null;
  componentAccPolicyId: string | null;
}

export interface PriceRow {
  priceType: string;
  price: number;
  currency: string;
}

export interface BarcodeRow {
  code: string;
  activity: boolean;
  goodPart: string;
  goodPartName: string;
}

export interface DrawerForm {
  name: string;
  sku: string;
  mainUnitId: string;
  packageRatio: string;
  specQty: string;
  weight: string;
  unitRatio: string;
  printName: string;
  description: string;
  fullDescription: string;
  accPolicyId: string;
}

/** 4 основні типи обʼєкта в drawer */
export type DrawerObjectKind = 'good' | 'kit' | 'group' | 'other';

export type CardTabKey = 'main' | 'content' | 'stickers';

export type RowDeleteKind = 'component' | 'price' | 'barcode';

export const OBJECT_KIND_TABS: Array<{ key: DrawerObjectKind; title: string; icon: IconName }> = [
  { key: 'good', title: 'Продукція', icon: 'shopping-bag' },
  { key: 'kit', title: 'Товарні набори', icon: 'package' },
  { key: 'group', title: 'Група', icon: 'folder' },
  { key: 'other', title: 'Інший обʼєкт', icon: 'file-spreadsheet' },
];

export const CARD_TABS: Array<{
  key: CardTabKey;
  title: string;
  titleMobile: string;
  icon: IconName;
}> = [
  { key: 'main', title: 'Основні дані', titleMobile: 'Основні', icon: 'clipboard-list' },
  { key: 'content', title: 'Опис і зображення', titleMobile: 'Опис', icon: 'images' },
  { key: 'stickers', title: 'Наліпки', titleMobile: 'Наліпки', icon: 'tag' },
];
