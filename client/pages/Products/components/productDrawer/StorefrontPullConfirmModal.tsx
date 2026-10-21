import { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable } from '@heroui/use-draggable';
import { useDebug } from '@/contexts/debug-context';
import {
  Accordion,
  AccordionItem,
  Button,
  Chip,
  Modal,
  Tab,
  Tabs,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import MetaLogJsonView from '@/components/MetaLogJsonView';
import { catalogApi } from '../../catalogApi';
import { OpenStorefrontProductLink } from '../OpenStorefrontProductLink';
import { storefrontApi } from '@/services/StorefrontService';
import type { CatalogDilovodPreviewResult, CatalogDilovodPullApplyField } from '@shared/types/catalog';
import type { WooPullApplyInput, WooPullPreviewResult } from '@shared/types/storefront';
import { isEffectivelyEmptyHtml } from '@shared/utils/storefrontDescriptionParser';
import {
  buildProductPullTriRows,
  filterProductPullTriRows,
  type ProductPullTriFieldView,
  type ProductPullSource,
  type ProductPullTriRow,
  type ProductPullTriRowId,
  ProductPullTriSourceTable,
  shouldPushTriSyncChoicesToWoo,
} from './ProductPullTriSourceTable';
import { resolveCatalogMediaAbsoluteUrls } from '@shared/utils/resolveCatalogMediaAbsoluteUrl';

export interface StorefrontPullApplyFlags {
  name: boolean;
  fullDescription: boolean;
  shortDescription: boolean;
  storefrontDescriptionDoc: boolean;
  productIngredientsJson: boolean;
  productNutritionJson: boolean;
  weight: boolean;
  regularPrice: boolean;
  doNotPublish: boolean;
  category: boolean;
  images: boolean;
  replaceImages: boolean;
  wooProductId: boolean;
}

interface StorefrontPullConfirmModalProps {
  isOpen: boolean;
  goodId: string | null;
  sku: string | null;
  localName: string;
  localFullDescription: string;
  localShortDescription: string;
  onApplied: () => void | Promise<void>;
  onClose: () => void;
}

function isEmpty(value: string | null | undefined): boolean {
  return isEffectivelyEmptyHtml(value);
}

function hasConflict(preview: WooPullPreviewResult, field: string): boolean {
  return preview.conflicts.some((c) => c.field === field);
}

function countLocalIngredients(raw: string | null | undefined): number {
  if (!raw?.trim()) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function buildDefaultTriSources(
  rows: ProductPullTriRow[],
  wooFlags: StorefrontPullApplyFlags,
): Record<string, ProductPullSource> {
  const wooByRow: Partial<Record<ProductPullTriRowId, boolean>> = {
    name: wooFlags.name,
    shortDescription: wooFlags.shortDescription,
    weight: wooFlags.weight,
    regularPrice: wooFlags.regularPrice,
    storefrontDescriptionDoc: wooFlags.storefrontDescriptionDoc,
    productIngredientsJson: wooFlags.productIngredientsJson,
    productNutritionJson: wooFlags.productNutritionJson,
    doNotPublish: wooFlags.doNotPublish,
    category: wooFlags.category,
    images: wooFlags.images,
  };
  const out: Record<string, ProductPullSource> = {};
  for (const row of rows) {
    if (!row.hasConflict) {
      out[row.id] = 'local';
      continue;
    }
    out[row.id] = wooByRow[row.id] ? 'woo' : 'local';
  }
  return out;
}

function wooFlagsFromTriSources(
  sourceByRowId: Record<string, ProductPullSource>,
): StorefrontPullApplyFlags {
  const pick = (id: ProductPullTriRowId) => sourceByRowId[id] === 'woo';
  return {
    name: pick('name'),
    fullDescription: false,
    shortDescription: pick('shortDescription'),
    storefrontDescriptionDoc: pick('storefrontDescriptionDoc'),
    productIngredientsJson: pick('productIngredientsJson'),
    productNutritionJson: pick('productNutritionJson'),
    weight: pick('weight'),
    regularPrice: pick('regularPrice'),
    doNotPublish: pick('doNotPublish'),
    category: pick('category'),
    images: pick('images'),
    replaceImages: false,
    wooProductId: false,
  };
}

function dilovodFieldsFromTriSources(
  sourceByRowId: Record<string, ProductPullSource>,
): CatalogDilovodPullApplyField[] {
  const fields: CatalogDilovodPullApplyField[] = [];
  if (sourceByRowId.name === 'dilovod') fields.push('name');
  if (sourceByRowId.weight === 'dilovod') fields.push('weight');
  if (sourceByRowId.regularPrice === 'dilovod') fields.push('regularPrice');
  return fields;
}

function defaultFlags(
  preview: WooPullPreviewResult,
  localName: string,
  localFullDescription: string,
  localShortDescription: string,
): StorefrontPullApplyFlags {
  const hasLocalImages = preview.local.imageCount > 0;
  const hasRemoteImages = preview.proposed.imageCount > 0;

  return {
    name: Boolean(preview.proposed.name) && (!localName.trim() || !hasConflict(preview, 'name')),
    fullDescription: !hasConflict(preview, 'fullDescription') && isEmpty(localFullDescription),
    shortDescription:
      Boolean(preview.proposed.shortDescription) &&
      (isEmpty(localShortDescription) || !hasConflict(preview, 'description')),
    storefrontDescriptionDoc: !hasConflict(preview, 'storefrontDescriptionDoc'),
    productIngredientsJson: !hasConflict(preview, 'productIngredientsJson'),
    productNutritionJson: !hasConflict(preview, 'productNutritionJson'),
    weight: !hasConflict(preview, 'weight'),
    regularPrice: Boolean(preview.proposed.regularPrice),
    doNotPublish: !hasConflict(preview, 'doNotPublish'),
    category: Boolean(preview.local.groupName) && !hasConflict(preview, 'category'),
    images: !hasConflict(preview, 'images') && hasRemoteImages && !hasLocalImages,
    replaceImages: false,
    wooProductId: true,
  };
}

function countParsedUniqueFields(parsed: WooPullPreviewResult['proposed']['parsed']): number {
  let count = 0;
  if (parsed.marketingText?.trim()) count += 1;
  if (parsed.productIngredientsJson.length > 0) count += 1;
  if (parsed.productNutritionJson) count += 1;
  return count;
}

function buildParsedUniquePreview(parsed: WooPullPreviewResult['proposed']['parsed']) {
  return {
    marketingText: parsed.marketingText,
    ingredients: parsed.productIngredientsJson,
    nutrition: parsed.productNutritionJson,
    warnings: parsed.parseWarnings,
    unparsed: parsed.unparsedHtmlChunks,
    uniqueFieldCount: countParsedUniqueFields(parsed),
  };
}

export function StorefrontPullConfirmModal({
  isOpen,
  goodId,
  sku,
  localName,
  localFullDescription,
  localShortDescription,
  onApplied,
  onClose,
}: StorefrontPullConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WooPullPreviewResult | null>(null);
  const [dilovodPreview, setDilovodPreview] = useState<CatalogDilovodPreviewResult | null>(null);
  const [sourceByRowId, setSourceByRowId] = useState<Record<string, ProductPullSource>>({});
  const modalTargetRef = useRef<HTMLElement>(null);
  const { isDebugMode } = useDebug();
  const { moveProps } = useDraggable({
    targetRef: modalTargetRef,
    isDisabled: !isOpen,
  });
  const [flags, setFlags] = useState<StorefrontPullApplyFlags>({
    name: false,
    fullDescription: false,
    shortDescription: false,
    storefrontDescriptionDoc: false,
    productIngredientsJson: false,
    productNutritionJson: false,
    weight: false,
    regularPrice: false,
    doNotPublish: false,
    category: false,
    images: false,
    replaceImages: false,
    wooProductId: true,
  });
  const [ingredientsConfirmOpen, setIngredientsConfirmOpen] = useState(false);
  const [imagesConfirmOpen, setImagesConfirmOpen] = useState(false);
  const [fieldView, setFieldView] = useState<ProductPullTriFieldView>('differences');
  const [mediaPublicBaseUrl, setMediaPublicBaseUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen) return;
    if (modalTargetRef.current) {
      modalTargetRef.current.style.transform = '';
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void storefrontApi.getSettings().then((settings) => {
      setMediaPublicBaseUrl(settings.wooCommerce.mediaPublicBaseUrl?.trim() || '');
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !goodId) return;
    setFieldView('differences');
    setLoading(true);
    setError(null);
    setPreview(null);
    setDilovodPreview(null);
    setSourceByRowId({});
    void Promise.all([
      storefrontApi.pullPreview(goodId),
      catalogApi.fetchDilovodPreview(goodId).catch(() => null),
    ])
      .then(([wooData, dilovodData]) => {
        setPreview(wooData);
        setDilovodPreview(dilovodData);
        const triRowsBuilt = buildProductPullTriRows(
          wooData,
          dilovodData,
          localName,
          localFullDescription,
          localShortDescription,
        );
        const wooFlags = defaultFlags(
          wooData,
          localName,
          localFullDescription,
          localShortDescription,
        );
        setFlags(wooFlags);
        setSourceByRowId(buildDefaultTriSources(triRowsBuilt, wooFlags));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [isOpen, goodId, localName, localFullDescription, localShortDescription]);

  const triRowsAll = useMemo(
    () =>
      preview
        ? buildProductPullTriRows(
            preview,
            dilovodPreview,
            localName,
            localFullDescription,
            localShortDescription,
          )
        : [],
    [preview, dilovodPreview, localName, localFullDescription, localShortDescription],
  );

  const triRows = useMemo(
    () =>
      filterProductPullTriRows(triRowsAll, {
        isKit: Boolean(preview?.isKit),
        fieldView,
      }),
    [triRowsAll, preview?.isKit, fieldView],
  );

  const localImagePreviewUrls = useMemo(
    () =>
      resolveCatalogMediaAbsoluteUrls(
        mediaPublicBaseUrl,
        preview?.localImagePreviewUrls ?? [],
      ),
    [mediaPublicBaseUrl, preview?.localImagePreviewUrls],
  );

  const hasApplySelection = useMemo(() => {
    const hasRemoteSelection = triRowsAll.some(
      (row) => (sourceByRowId[row.id] ?? 'local') !== 'local',
    );
    const needsLegacyFullSeed =
      preview?.wcCompareEnabled !== false &&
      isEmpty(localFullDescription) &&
      Boolean(preview?.proposed.fullDescription?.trim());
    return hasRemoteSelection || needsLegacyFullSeed;
  }, [
    triRowsAll,
    sourceByRowId,
    localFullDescription,
    preview?.proposed.fullDescription,
    preview?.wcCompareEnabled,
  ]);

  const selectedCount = useMemo(
    () => triRowsAll.filter((row) => (sourceByRowId[row.id] ?? 'local') !== 'local').length,
    [triRowsAll, sourceByRowId],
  );

  const runApply = async () => {
    if (!goodId) return;
    setApplying(true);
    setError(null);
    try {
      const wooApply = wooFlagsFromTriSources(sourceByRowId);
      wooApply.replaceImages = flags.replaceImages;
      const dilovodFields = dilovodFieldsFromTriSources(sourceByRowId);

      if (dilovodFields.length > 0) {
        await catalogApi.applyDilovodPull(goodId, { fields: dilovodFields });
      }

      const hasWooApply = Object.entries(wooApply).some(
        ([key, value]) => key !== 'replaceImages' && value === true,
      );
      const needsLegacyFullSeed =
        isEmpty(localFullDescription) && Boolean(preview?.proposed.fullDescription?.trim());

      if (preview.wcCompareEnabled !== false) {
        if (hasWooApply) {
          wooApply.wooProductId = true;
          await storefrontApi.pullApply({ goodId, apply: wooApply });
        } else if (needsLegacyFullSeed) {
          await storefrontApi.pullApply({ goodId, apply: { fullDescription: true } });
        }
      }

      const pushBoToWoo =
        preview &&
        preview.wcCompareEnabled !== false &&
        shouldPushTriSyncChoicesToWoo(
          triRowsAll,
          sourceByRowId,
          preview.conflicts.map((c) => c.field),
        );

      await Promise.resolve(onApplied());

      if (pushBoToWoo) {
        await storefrontApi.pushApply(goodId);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
      setIngredientsConfirmOpen(false);
      setImagesConfirmOpen(false);
    }
  };

  const proceedAfterIngredientConfirm = () => {
    if (!preview) return;
    setIngredientsConfirmOpen(false);
    const wooApply = wooFlagsFromTriSources(sourceByRowId);

    if (wooApply.images && flags.replaceImages && preview.local.imageCount > 0) {
      setImagesConfirmOpen(true);
      return;
    }

    if (wooApply.images && preview.local.imageCount > 0 && !flags.replaceImages) {
      setError('Увімкніть «Замінити існуючі зображення» або зніміть вибір поля «Зображення»');
      return;
    }

    void runApply();
  };

  const handleApply = () => {
    if (!goodId || !hasApplySelection || !preview) return;

    const wooApply = wooFlagsFromTriSources(sourceByRowId);
    const localIngredientCount = countLocalIngredients(preview.local.productIngredientsJson);
    if (wooApply.productIngredientsJson && localIngredientCount > 0) {
      setIngredientsConfirmOpen(true);
      return;
    }

    proceedAfterIngredientConfirm();
  };

  const parsedPreview = preview ? buildParsedUniquePreview(preview.proposed.parsed) : null;
  const wooImagesSelected = sourceByRowId.images === 'woo';

  return (
    <>
      <Modal
        ref={modalTargetRef}
        isOpen={isOpen}
        onClose={onClose}
        size="4xl"
        isDismissable={false}
        scrollBehavior="inside"
        classNames={{ 
          base: 'rounded-xl',
          closeButton: 'top-4 right-3',
        }}
      >
        <ModalContent>
          <ModalHeader
            {...moveProps}
            className="flex flex-col items-start gap-1 pb-2 px-4 cursor-move touch-none select-none"
          >
            <div className="flex flex-wrap items-center pr-8 gap-2">
              <span className="flex items-center gap-1">Синхронізація даних товару</span>
              {sku && (
                <Chip variant="flat" color="default" className="font-mono text-default-500 h-auto min-w-0 w-auto px-0.5 py-0.5">
                  {sku}
                </Chip>
              )}
              {isDebugMode && (
                <span className="text-xs font-normal text-default-500">WooCommerce #{preview?.wooProductId}</span>
              )}
              <Tabs
                size="sm"
                color="secondary"
                aria-label="Фільтр полів порівняння"
                selectedKey={fieldView}
                onSelectionChange={(key) =>
                  setFieldView(String(key) as ProductPullTriFieldView)
                }
                classNames={{ base: 'ml-10', tabList: 'gap-0 border-1 border-gray-500/15', tab: 'h-7 min-h-7 px-2.5 text-xs', cursor: 'bg-gray-600', tabContent: 'text-gray-600 group-data-[selected=true]:text-white' }}
              >
                <Tab key="differences" title="Лише відмінності" />
                <Tab key="all" title="Усі поля" />
              </Tabs>
            </div>
          </ModalHeader>

          <ModalBody className="gap-5 scrollbar-thin-transparent p-4 min-h-60">
            {loading && (
              <div className="flex items-center justify-center h-full flex-1 text-default-500">
                <Spinner size="sm" />
                <span className="ml-2 text-sm">Завантаження preview…</span>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {preview?.wcCompareEnabled === false ? (
              <p className="text-xs text-default-500">
                Порівняння з WooCommerce — лише для товарів у гілці «Готова продукція». Доступне
                узгодження з Dilovod.
              </p>
            ) : null}

            {preview && triRows.length === 0 && fieldView === 'differences' ? (
              <p className="text-sm text-default-500 pt-8 pb-6 text-center flex items-center justify-center h-full flex-1 gap-2">
                <DynamicIcon name="check-circle" size={24} className="text-success" />
                Відмінностей між джерелами не знайдено
              </p>
            ) : null}

            {preview && triRows.length > 0 && (
              <>
                <ProductPullTriSourceTable
                  rows={triRows}
                  sourceByRowId={sourceByRowId}
                  localImagePreviewUrls={localImagePreviewUrls}
                  wooImagePreviewUrls={preview.wooImagePreviewUrls ?? []}
                  replaceImages={
                    wooImagesSelected && preview.local.imageCount > 0
                      ? {
                          visible: true,
                          checked: flags.replaceImages,
                          localImageCount: preview.local.imageCount,
                          onChange: (checked) =>
                            setFlags((prev) => ({ ...prev, replaceImages: checked })),
                        }
                      : undefined
                  }
                  onSourceChange={(rowId, source) =>
                    setSourceByRowId((prev) => ({ ...prev, [rowId]: source }))
                  }
                />

                {preview && (
                  <div className="flex flex-wrap items-center justify-between w-full gap-3">
                    <p className="text-xs font-normal text-default-500">Оберіть джерело для кожного поля</p>
                    {selectedCount > 0 ? (
                      <p className="text-xs text-default-500 flex items-center gap-1">
                        <DynamicIcon name="check-circle" size={14} className="text-success" />
                        {selectedCount}{' '}
                        {selectedCount === 1 ? 'поле' : selectedCount < 5 ? 'поля' : 'полів'} буде оновлено
                      </p>
                    ) : (
                      <p className="text-xs text-default-500">
                        Усі видимі поля залишаються з Backoffice, нічого не буде перезаписано
                      </p>
                    )}
                  </div>
                )}

                {parsedPreview && isDebugMode && (
                  <Accordion variant="splitted" className="px-0">
                    <AccordionItem
                      key="parsed"
                      aria-label="Parsed blocks preview"
                      title={
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-normal text-default-500">Parsed blocks preview</span>
                          <Chip size="sm" variant="flat">
                            {parsedPreview.uniqueFieldCount > 0
                              ? `${parsedPreview.uniqueFieldCount} унік. полів`
                              : 'без унікальних даних'}
                          </Chip>
                          {parsedPreview.warnings.length > 0 ? (
                            <Chip size="sm" color="warning" variant="flat">
                              {parsedPreview.warnings.length} warnings
                            </Chip>
                          ) : (
                            <Chip size="sm" color="success" variant="flat">
                              без warnings
                            </Chip>
                          )}
                        </div>
                      }
                    >
                      <div className="space-y-3">
                        {parsedPreview.warnings.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {parsedPreview.warnings.map((warning) => (
                              <Chip key={warning} size="sm" color="warning" variant="flat">
                                {warning}
                              </Chip>
                            ))}
                          </div>
                        )}

                        {parsedPreview.marketingText && (
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-default-600">Унікальний текст</p>
                            <p className="rounded-md bg-default-50 px-3 py-2 text-sm text-default-700 whitespace-pre-wrap">
                              {parsedPreview.marketingText}
                            </p>
                          </div>
                        )}

                        {parsedPreview.ingredients.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-default-600">Інгредієнти</p>
                            <div className="flex flex-wrap gap-1.5">
                              {parsedPreview.ingredients.map((item) => (
                                <Chip key={item} size="sm" variant="flat">
                                  {item}
                                </Chip>
                              ))}
                            </div>
                          </div>
                        )}

                        {parsedPreview.nutrition && (
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-default-600">КБЖВ</p>
                            <div className="flex flex-wrap gap-1.5">
                              {parsedPreview.nutrition.proteins && (
                                <Chip size="sm" variant="flat">
                                  Білки {parsedPreview.nutrition.proteins}
                                </Chip>
                              )}
                              {parsedPreview.nutrition.fats && (
                                <Chip size="sm" variant="flat">
                                  Жири {parsedPreview.nutrition.fats}
                                </Chip>
                              )}
                              {parsedPreview.nutrition.carbs && (
                                <Chip size="sm" variant="flat">
                                  Вуглеводи {parsedPreview.nutrition.carbs}
                                </Chip>
                              )}
                              {parsedPreview.nutrition.energy && (
                                <Chip size="sm" variant="flat">
                                  {parsedPreview.nutrition.energy} ккал
                                </Chip>
                              )}
                            </div>
                          </div>
                        )}

                        {!parsedPreview.marketingText &&
                          parsedPreview.ingredients.length === 0 &&
                          !parsedPreview.nutrition && (
                            <p className="text-sm text-default-500">
                              Службові блоки (зберігання, розігрів, сіль тощо) з legacy HTML не
                              імпортуються — залишаться шаблони preset.
                            </p>
                          )}

                        <MetaLogJsonView
                          value={{
                            marketingText: parsedPreview.marketingText,
                            ingredients: parsedPreview.ingredients,
                            nutrition: parsedPreview.nutrition,
                            unparsedHtmlChunks: parsedPreview.unparsed,
                          }}
                          className="max-h-52"
                          collapsed={2}
                        />
                      </div>
                    </AccordionItem>
                  </Accordion>
                )}
              </>
            )}
          </ModalBody>

          {preview && (
          <ModalFooter className="gap-2 px-4 border-t border-default-200/75">
            <Button
              variant="light"
              onPress={() => window.open(preview?.storefrontUrl ?? '', '_blank')}
              isDisabled={applying}
              startContent={<DynamicIcon name="external-link" size={15} />}
              className="mr-auto cursor-pointer"
            >
              Відкрити товар на сайті
            </Button>
            <Button variant="light" onPress={onClose} isDisabled={applying}>
              Скасувати
            </Button>
            <Button
              color="primary"
              onPress={() => void handleApply()}
              isDisabled={!preview || !hasApplySelection || applying}
              isLoading={applying}
              startContent={!applying ? <DynamicIcon name="download" size={15} /> : undefined}
            >
              Застосувати
            </Button>
          </ModalFooter>
          )}
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={ingredientsConfirmOpen}
        title="Замінити теги складу?"
        message="Усі локальні теги складу будуть повністю замінені даними з WooCommerce. Продовжити?"
        confirmText="Замінити"
        confirmColor="warning"
        confirmLoading={applying}
        onConfirm={proceedAfterIngredientConfirm}
        onCancel={() => setIngredientsConfirmOpen(false)}
      />

      <ConfirmModal
        isOpen={imagesConfirmOpen}
        title="Замінити зображення?"
        message={`Усі ${preview?.local.imageCount ?? 0} локальних зображень будуть видалені та замінені з WooCommerce. Продовжити?`}
        confirmText="Замінити"
        confirmColor="warning"
        confirmLoading={applying}
        onConfirm={() => void runApply()}
        onCancel={() => setImagesConfirmOpen(false)}
      />
    </>
  );
}
