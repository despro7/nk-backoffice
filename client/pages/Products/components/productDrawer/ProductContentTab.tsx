import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionItem,
  Chip,
  Select,
  SelectItem,
  Switch,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogGoodDetailDto } from '../../ProductsTypes';
import type { BomRow, DrawerForm } from './productDrawerTypes';
import type { DrawerDirtyFieldKey } from './productDrawerUtils';
import { FieldDirtyMarker } from './FieldDirtyMarker';
import { DescriptionEditor } from '../DescriptionEditor';
import { ProductImageUpload } from '../ProductImageUpload';
import type { CatalogGoodImageDto } from '@shared/types/catalog';
import { StorefrontNutritionFields } from './StorefrontNutritionFields';
import { ProductIngredientsTags } from './ProductIngredientsTags';
import { StorefrontDescriptionEditor } from './StorefrontDescriptionEditor';
import { storefrontApi, STOREFRONT_SETTINGS_UPDATED_EVENT } from '@/services/StorefrontService';
import type { StorefrontKitComponentSettings, StorefrontPresetDto } from '@shared/types/storefront';
import {
  STOREFRONT_BUILTIN_DEFAULTS,
  STOREFRONT_DEFAULT_BLOCKS,
  STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS,
} from '@shared/constants/storefrontDefaults';
import {
  buildIngredientsJsonFromBom,
  buildStorefrontBoundValues,
  buildStorefrontDescriptionDocFromPreset,
  getStorefrontEnabledBlockIds,
  parseStorefrontDescriptionDoc,
  resolveKitComponentsBlockTemplate,
  storefrontDescriptionNeedsPresetSync,
  syncStorefrontDescriptionDocWithPreset,
  formatGrossWeightLabel,
  formatProductNutritionHtml,
  stringifyStorefrontDescriptionDoc,
  type KitComponentRow,
} from '@shared/utils/storefrontDescription';
import { formatNetWeightLabel } from '@shared/utils/productLabel';

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
  overlayZClassName?: string;
  dirtyFields?: Set<DrawerDirtyFieldKey>;
  onHydrationComplete?: () => void;
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
  overlayZClassName,
  dirtyFields,
  onHydrationComplete,
}: ProductContentTabProps) {
  const [presets, setPresets] = useState<StorefrontPresetDto[]>([]);
  const [defaultPresetId, setDefaultPresetId] = useState<string | null>(null);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [kitComponentSettings, setKitComponentSettings] = useState<StorefrontKitComponentSettings>(
    STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS,
  );
  const hydrationNotifiedRef = useRef(false);
  const [contentSyncVersion, setContentSyncVersion] = useState(0);
  const [editorSettled, setEditorSettled] = useState(false);

  useEffect(() => {
    if (!canReadStorefront) {
      setPresetsLoaded(true);
      return;
    }

    const loadStorefrontSettings = () => {
      void Promise.all([storefrontApi.listPresets(), storefrontApi.getSettings()])
        .then(([presetRows, settings]) => {
          setPresets(presetRows);
          setDefaultPresetId(settings.defaultPresetId);
          setKitComponentSettings(settings.kitComponentSettings);
          setPresetsLoaded(true);
        })
        .catch(() => setPresetsLoaded(true));
    };

    loadStorefrontSettings();
    window.addEventListener('focus', loadStorefrontSettings);
    window.addEventListener(STOREFRONT_SETTINGS_UPDATED_EVENT, loadStorefrontSettings);
    return () => {
      window.removeEventListener('focus', loadStorefrontSettings);
      window.removeEventListener(STOREFRONT_SETTINGS_UPDATED_EVENT, loadStorefrontSettings);
    };
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

  const mainProductLabel = useMemo(() => {
    const manual = Number(String(form.mainProductWeight).replace(',', '.'));
    if (Number.isFinite(manual) && manual > 0) return formatGrossWeightLabel(manual);
    return '';
  }, [form.mainProductWeight]);

  const grossLabel = useMemo(() => {
    const manual = Number(String(form.grossWeight).replace(',', '.'));
    if (Number.isFinite(manual) && manual > 0) return formatGrossWeightLabel(manual);
    return '';
  }, [form.grossWeight]);

  const netLabel = useMemo(() => {
    const manual = Number(String(form.weight).replace(',', '.'));
    if (Number.isFinite(manual) && manual > 0) return formatNetWeightLabel(manual);
    return '';
  }, [form.weight]);

  const kitComponentRows = useMemo<KitComponentRow[]>(
    () =>
      isKit
        ? components.map((c) => ({
            componentName: c.componentName,
            qty: c.qty,
            componentWeight: c.componentWeight,
            componentCategoryName: c.componentCategoryName ?? null,
          }))
        : [],
    [components, isKit],
  );

  const kitComponentsTemplate = useMemo(() => {
    const presetBlock = activePreset.blocks.find((block) => block.resolver === 'kitComponents');
    return resolveKitComponentsBlockTemplate(
      presetBlock?.template ||
        STOREFRONT_BUILTIN_DEFAULTS.kitComponents.template ||
        '{{kitComponents}}',
    );
  }, [activePreset.blocks]);

  const enabledBlockIds = useMemo(
    () => getStorefrontEnabledBlockIds(activePreset.blocks, { isKit }),
    [activePreset.blocks, isKit],
  );

  const storefrontRenderOptions = useMemo(
    () => ({
      isKit,
      kitComponentRows,
      kitComponentSettings,
      enabledBlockIds,
    }),
    [isKit, kitComponentRows, kitComponentSettings, enabledBlockIds],
  );

  const boundValues = useMemo(
    () =>
      buildStorefrontBoundValues({
        ingredientsJson: form.productIngredientsJson,
        nutrition: form.productNutritionJson,
        netLabel,
        mainProductLabel,
        grossLabel,
        storageTemplate: STOREFRONT_BUILTIN_DEFAULTS.storage.template,
        heatingTemplate: STOREFRONT_BUILTIN_DEFAULTS.heating.template,
        saltTemplate: STOREFRONT_BUILTIN_DEFAULTS.salt.template,
        kitComponentRows,
        kitComponentsTemplate,
        kitComponentSettings,
      }),
    [
      form.productIngredientsJson,
      form.productNutritionJson,
      netLabel,
      mainProductLabel,
      grossLabel,
      kitComponentRows,
      kitComponentsTemplate,
      kitComponentSettings,
    ],
  );

  const handleEditorSettled = React.useCallback(
    (normalizedDoc: string) => {
      setForm((f) =>
        f.storefrontDescriptionDoc === normalizedDoc
          ? f
          : { ...f, storefrontDescriptionDoc: normalizedDoc },
      );
      setEditorSettled(true);
    },
    [setForm],
  );

  useEffect(() => {
    if (!presetsLoaded || !activePreset) return;
    setEditorSettled(false);
    setForm((f) => {
      const parsed = parseStorefrontDescriptionDoc(f.storefrontDescriptionDoc);
      if (parsed) {
        if (!storefrontDescriptionNeedsPresetSync(parsed, activePreset.blocks, { isKit })) {
          return f;
        }
        const next = stringifyStorefrontDescriptionDoc(
          syncStorefrontDescriptionDocWithPreset(parsed, activePreset.blocks, { isKit }),
        );
        if (next === f.storefrontDescriptionDoc) return f;
        return { ...f, storefrontDescriptionDoc: next };
      }
      if (f.storefrontDescriptionDoc.trim()) return f;
      const next = stringifyStorefrontDescriptionDoc(
        buildStorefrontDescriptionDocFromPreset(activePreset.blocks, { isKit }),
      );
      return { ...f, storefrontDescriptionDoc: next };
    });
    setContentSyncVersion((v) => v + 1);
  }, [presetsLoaded, activePreset?.id, activePreset?.blocks, isKit, setForm]);

  useEffect(() => {
    if (!presetsLoaded || isKit || form.productIngredientsJson.length > 0) return;
    setEditorSettled(false);
    const bomTags = buildIngredientsJsonFromBom(
      components.map((c) => ({ componentName: c.componentName, qty: c.qty })),
    );
    if (!bomTags.length) return;
    setForm((f) => ({ ...f, productIngredientsJson: bomTags }));
    setContentSyncVersion((v) => v + 1);
  }, [presetsLoaded, components, form.productIngredientsJson.length, isKit, setForm]);

  useEffect(() => {
    if (!presetsLoaded || !editorSettled || !onHydrationComplete || hydrationNotifiedRef.current) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (hydrationNotifiedRef.current) return;
        hydrationNotifiedRef.current = true;
        onHydrationComplete();
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [presetsLoaded, contentSyncVersion, editorSettled, onHydrationComplete]);

  const nutritionPreview = form.productNutritionJson
    ? formatProductNutritionHtml(form.productNutritionJson)
    : '';

  const resolvedBoundValues = useMemo(
    () => ({
      ...boundValues,
      nutrition: nutritionPreview || boundValues.nutrition,
    }),
    [boundValues, nutritionPreview],
  );

  const storefrontDocValue = form.storefrontDescriptionDoc;

  return (
    <section className="space-y-6">
      {!isKit && (
        <ProductIngredientsTags
          value={form.productIngredientsJson}
          components={components}
          disabled={storefrontFieldsLocked}
          dirty={dirtyFields?.has('productIngredientsJson')}
          onChange={(next) => setForm((f) => ({ ...f, productIngredientsJson: next }))}
        />
      )}

      <StorefrontNutritionFields
        value={form.productNutritionJson}
        disabled={storefrontFieldsLocked}
        dirty={dirtyFields?.has('productNutritionJson')}
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
            <span className="inline-flex items-center gap-1.5">
              Не публікувати на сайті
              <FieldDirtyMarker show={dirtyFields?.has('doNotPublish')} />
            </span>
          </Switch>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <DynamicIcon name="file-text" size={14} className="text-default-500 shrink-0" />
            Повний опис
            <FieldDirtyMarker show={dirtyFields?.has('storefrontDescriptionDoc')} />
          </h3>
          <Select
            size="sm"
            labelPlacement="outside-left"
            label={
              <span className="inline-flex items-center gap-1.5">
                Шаблон опису
                <FieldDirtyMarker show={dirtyFields?.has('storefrontPresetId')} />
              </span>
            }
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
              setForm((f) => ({
                ...f,
                storefrontPresetId: id === defaultPresetId ? '' : id,
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
          presetBlocks={activePreset.blocks}
          renderOptions={storefrontRenderOptions}
          isDisabled={publishLocked}
          onChange={(json) => setForm((f) => ({ ...f, storefrontDescriptionDoc: json }))}
          onInitialSettled={handleEditorSettled}
          minHeightClass="min-h-[200px]"
          overlayZClassName={overlayZClassName}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <DynamicIcon name="align-left" size={14} className="text-default-500 shrink-0" />
          Короткий опис
          <FieldDirtyMarker show={dirtyFields?.has('description')} />
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
          <FieldDirtyMarker show={dirtyFields?.has('images')} />
        </h3>
        <ProductImageUpload
          goodId={isEdit ? detail?.id : null}
          stagingSessionId={!isEdit ? stagingSessionId : null}
          images={images}
          isDisabled={fieldsLocked}
          overlayZClassName={overlayZClassName}
          onImagesChange={onImagesChange}
        />
      </div>

      {isAdmin && (
        <Accordion variant="light" className="mt-10">
          <AccordionItem
            key="legacy-full-description"
            aria-label="Legacy full description"
            title="Legacy fullDescription (admin)"
            subtitle={
              detail?.wooLastSyncedAt
                ? `Оновлено з WC ${new Date(detail.wooLastSyncedAt).toLocaleString('uk-UA')}`
                : 'Лише для WP pull / парсингу'
            }
            classNames={{
              base: 'data-[hover=true]:bg-default-100',
              trigger: 'py-2 flex-row-reverse',
              title: 'text-sm',
              subtitle: 'text-xs text-default-400/75',
              indicator: '-rotate-180',
            }}
          >
            {detail?.wooLastSyncedAt && (
              <Chip size="sm" variant="flat" color="success" className="mb-2">
                Оновлено з WC {new Date(detail.wooLastSyncedAt).toLocaleString('uk-UA')}
              </Chip>
            )}
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
