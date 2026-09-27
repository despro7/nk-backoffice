import React, { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionItem,
  Select,
  SelectItem,
  Switch,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogGoodDetailDto } from '../../ProductsTypes';
import type { BomRow, DrawerForm } from './productDrawerTypes';
import { DescriptionEditor } from '../DescriptionEditor';
import { ProductImageUpload } from '../ProductImageUpload';
import type { CatalogGoodImageDto } from '@shared/types/catalog';
import { StorefrontNutritionFields } from './StorefrontNutritionFields';
import { ProductIngredientsTags } from './ProductIngredientsTags';
import { StorefrontDescriptionEditor } from './StorefrontDescriptionEditor';
import { storefrontApi } from '@/services/StorefrontService';
import type { StorefrontPresetDto } from '@shared/types/storefront';
import {
  STOREFRONT_BUILTIN_DEFAULTS,
  STOREFRONT_DEFAULT_BLOCKS,
} from '@shared/constants/storefrontDefaults';
import {
  buildIngredientsJsonFromBom,
  buildKitComponentsHtml,
  buildStorefrontBoundValues,
  ensureStorefrontDescriptionDoc,
  formatGrossWeightLabel,
  formatProductNutritionHtml,
  parseStorefrontDescriptionDoc,
  stringifyStorefrontDescriptionDoc,
} from '@shared/utils/storefrontDescription';
import { formatNetWeightLabel } from '@shared/utils/productLabel';
import { buildTechCardRows } from '../../ProductsUtils';

interface ProductContentTabProps {
  form: DrawerForm;
  setForm: React.Dispatch<React.SetStateAction<DrawerForm>>;
  components: BomRow[];
  detail: CatalogGoodDetailDto | null;
  isEdit: boolean;
  isKit: boolean;
  isAdmin: boolean;
  fieldsLocked: boolean;
  canReadStorefront: boolean;
  canEditStorefront: boolean;
  images: CatalogGoodImageDto[];
  stagingSessionId: string | null;
  units: Array<{ id: string; name: string; code?: string | null }>;
  onImagesChange: (images: CatalogGoodImageDto[]) => void;
}

export function ProductContentTab({
  form,
  setForm,
  components,
  detail,
  isEdit,
  isKit,
  isAdmin,
  fieldsLocked,
  canReadStorefront,
  canEditStorefront,
  images,
  stagingSessionId,
  units,
  onImagesChange,
}: ProductContentTabProps) {
  const [presets, setPresets] = useState<StorefrontPresetDto[]>([]);
  const [defaultPresetId, setDefaultPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (!canReadStorefront) return;
    void Promise.all([storefrontApi.listPresets(), storefrontApi.getSettings()])
      .then(([presetRows, settings]) => {
        setPresets(presetRows);
        setDefaultPresetId(settings.defaultPresetId);
      })
      .catch(() => undefined);
  }, [canReadStorefront]);

  const offlinePreset = useMemo<StorefrontPresetDto>(
    () => ({
      id: '',
      name: 'Стандарт',
      isDefault: true,
      blocks: STOREFRONT_DEFAULT_BLOCKS,
      createdAt: '',
      updatedAt: '',
    }),
    [],
  );

  const effectivePresetId = form.storefrontPresetId || defaultPresetId || presets[0]?.id || '';
  const activePreset =
    presets.find((p) => p.id === effectivePresetId) || presets[0] || offlinePreset;
  const publishLocked = form.doNotPublish || fieldsLocked || !canEditStorefront;
  const storefrontFieldsLocked = fieldsLocked || !canEditStorefront;

  const autoGrossKg = useMemo(() => {
    if (!components.length) return null;
    const rows = buildTechCardRows(
      components.map((c) => ({
        componentName: c.componentName,
        qty: c.qty,
        unitId: c.unitId,
        componentWeight: c.componentWeight,
        note: c.note,
        cookingLossPercent: isKit ? 0 : c.cookingLossPercent,
      })),
      units,
      Number(form.specQty) || 1,
      1,
    );
    return rows.totalGrossMassKg;
  }, [components, units, form.specQty, isKit]);

  const grossLabel = useMemo(() => {
    const manual = Number(String(form.grossWeight).replace(',', '.'));
    if (Number.isFinite(manual) && manual > 0) return formatGrossWeightLabel(manual);
    if (autoGrossKg != null) return formatGrossWeightLabel(autoGrossKg);
    return '';
  }, [form.grossWeight, autoGrossKg]);

  const netLabel = useMemo(() => {
    const manual = Number(String(form.weight).replace(',', '.'));
    if (Number.isFinite(manual) && manual > 0) return formatNetWeightLabel(manual);
    return '';
  }, [form.weight]);

  const boundValues = useMemo(
    () =>
      buildStorefrontBoundValues({
        ingredientsJson: form.productIngredientsJson,
        nutrition: form.productNutritionJson,
        netLabel,
        grossLabel,
        storageTemplate: STOREFRONT_BUILTIN_DEFAULTS.storage.template,
        heatingTemplate: STOREFRONT_BUILTIN_DEFAULTS.heating.template,
        saltTemplate: STOREFRONT_BUILTIN_DEFAULTS.salt.template,
        kitComponentsHtml: isKit
          ? buildKitComponentsHtml(
              components.map((c) => ({ componentName: c.componentName, qty: c.qty })),
            )
          : '',
      }),
    [form.productIngredientsJson, form.productNutritionJson, netLabel, grossLabel, isKit, components],
  );

  useEffect(() => {
    if (!activePreset) return;
    if (form.storefrontDescriptionDoc.trim()) return;
    const doc = ensureStorefrontDescriptionDoc(null, activePreset.blocks, { isKit });
    setForm((f) => ({ ...f, storefrontDescriptionDoc: stringifyStorefrontDescriptionDoc(doc) }));
  }, [activePreset, isKit, form.storefrontDescriptionDoc, setForm]);

  useEffect(() => {
    if (form.productIngredientsJson.length > 0) return;
    const bomTags = buildIngredientsJsonFromBom(
      components.map((c) => ({ componentName: c.componentName, qty: c.qty })),
    );
    if (!bomTags.length) return;
    setForm((f) => ({ ...f, productIngredientsJson: bomTags }));
  }, [components, form.productIngredientsJson.length, setForm]);

  const nutritionPreview = form.productNutritionJson
    ? formatProductNutritionHtml(form.productNutritionJson)
    : '';

  const resolvedBoundValues = useMemo(
    () => ({
      ...boundValues,
      nutrition: nutritionPreview
        ? nutritionPreview
        : boundValues.nutrition,
    }),
    [boundValues, nutritionPreview],
  );

  const storefrontDocValue = form.storefrontDescriptionDoc;

  return (
    <section className="space-y-6">
      <ProductIngredientsTags
        value={form.productIngredientsJson}
        components={components}
        disabled={storefrontFieldsLocked}
        onChange={(next) => setForm((f) => ({ ...f, productIngredientsJson: next }))}
      />

      <StorefrontNutritionFields
        value={form.productNutritionJson}
        disabled={storefrontFieldsLocked}
        onChange={(v) => setForm((f) => ({ ...f, productNutritionJson: v }))}
      />

      <div className="mt-10">
        <div className="flex flex-wrap items-center gap-4">
          <Switch
            size="sm"
            color="danger"
            classNames={{
              label: 'font-medium text-default-400/75 group-data-[selected=true]:text-danger',
            }}
            isSelected={form.doNotPublish}
            isDisabled={storefrontFieldsLocked}
            onValueChange={(v) => setForm((f) => ({ ...f, doNotPublish: v }))}
          >
            Не публікувати на вітрині
          </Switch>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <DynamicIcon name="file-text" size={14} className="text-default-500 shrink-0" />
            Повний опис
          </h3>
          <Select
            size="sm"
            labelPlacement="outside-left"
            label="Шаблон"
            classNames={{
              base: 'w-auto max-w-xs ml-auto',
              trigger: 'w-auto min-w-46',
            }}
            selectedKeys={
              effectivePresetId && presets.some((p) => p.id === effectivePresetId)
                ? [effectivePresetId]
                : []
            }
            isDisabled={publishLocked || presets.length === 0 || !canReadStorefront}
            onSelectionChange={(keys) => {
              const id = Array.from(keys)[0] as string;
              if (!id) return;
              const preset = presets.find((p) => p.id === id);
              const doc = preset
                ? ensureStorefrontDescriptionDoc(null, preset.blocks, { isKit })
                : parseStorefrontDescriptionDoc(form.storefrontDescriptionDoc);
              setForm((f) => ({
                ...f,
                storefrontPresetId: id === defaultPresetId ? '' : id,
                storefrontDescriptionDoc: doc
                  ? stringifyStorefrontDescriptionDoc(doc)
                  : f.storefrontDescriptionDoc,
              }));
            }}
          >
            {presets.map((p) => (
              <SelectItem key={p.id} textValue={p.name}>
                {p.name}
                {p.id === defaultPresetId ? ' (дефолт)' : ''}
              </SelectItem>
            ))}
          </Select>
        </div>
        <StorefrontDescriptionEditor
          value={storefrontDocValue}
          boundValues={resolvedBoundValues}
          isDisabled={publishLocked}
          onChange={(json) => setForm((f) => ({ ...f, storefrontDescriptionDoc: json }))}
          minHeightClass="min-h-[200px]"
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <DynamicIcon name="align-left" size={14} className="text-default-500 shrink-0" />
          Короткий опис
        </h3>
        <DescriptionEditor
          aria-label="Короткий опис"
          value={form.description}
          onChange={(html) => setForm((f) => ({ ...f, description: html }))}
          isDisabled={publishLocked}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <DynamicIcon name="image" size={14} className="text-default-500 shrink-0" />
          Зображення
        </h3>
        <ProductImageUpload
          goodId={isEdit ? detail?.id : null}
          stagingSessionId={!isEdit ? stagingSessionId : null}
          images={images}
          isDisabled={fieldsLocked}
          onImagesChange={onImagesChange}
        />
      </div>

      {isAdmin && (
        <Accordion variant="light" className="mt-10">
          <AccordionItem
            key="legacy-full-description"
            aria-label="Legacy full description"
            title="Legacy fullDescription (admin)"
            subtitle="Лише для WP pull / майбутнього парсингу"
            classNames={{
              trigger: 'py-2',
            }}
          >
            <DescriptionEditor
              aria-label="Legacy full description"
              value={form.fullDescription}
              onChange={() => undefined}
              isDisabled
              minHeightClass="min-h-[120px]"
            />
          </AccordionItem>
        </Accordion>
      )}
    </section>
  );
}
