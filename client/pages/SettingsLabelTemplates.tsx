import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Select,
  SelectItem,
  Switch,
  Tooltip,
} from '@heroui/react';
import { Designer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import { DynamicIcon } from 'lucide-react/dynamic';
import { LABEL_INPUT_KEYS, LABEL_INPUT_LABELS } from '@shared/constants/labelInputKeys';
import {
  LABEL_MVT_VARIABLE_KEYS,
  LABEL_MVT_VARIABLE_LABELS,
} from '@shared/constants/labelMvtVariables';
import {
  buildPortionLabelTemplate,
  hydrateLabelTemplateContent,
  toLabelPdfmeTemplate,
} from '@shared/pdfme/builtInLabelTemplates';
import type { LabelTemplateAudience, LabelTemplateDefaults, LabelTemplateDto } from '@shared/types/labelTemplate';
import type { ProductLabelKind } from '@shared/types/productLabel';
import { LabelTemplateService } from '@/services/LabelTemplateService';
import { ToastService } from '@/services/ToastService';
import { createLabelPdfmePlugins } from '@shared/pdfme/labelPdfmePlugins';
import { mergeLabelTemplateGeometry } from '@shared/pdfme/mergeLabelTemplateGeometry';
import { syncLabelTemplateFromDesignerDom } from '@shared/pdfme/syncDesignerDomToTemplate';
import type { LabelPdfmeTemplate } from '@shared/types/labelTemplate';
import type { DesignerSelectedSchemaRef } from './Settings/labelTemplates/labelDesignerRotate';
import { loadClientLabelFonts, loadLabelDesignerAssets } from './Settings/labelTemplates/labelPdfmeFonts';
import { LabelTemplateGoodOverridesTable } from './Settings/labelTemplates/LabelTemplateGoodOverridesTable';
import { LabelTemplateIcon } from './Settings/labelTemplates/LabelTemplateIcon';
import { LabelTemplateIconPicker } from './Settings/labelTemplates/LabelTemplateIconPicker';
import MovementMobProductEditDrawer from '@/pages/Warehouse/WarehouseMovementMob/components/MovementMobProductEditDrawer';
import {
  DEFAULT_LABEL_TEMPLATE_ICON,
  type LabelTemplateIconKey,
} from '@shared/constants/labelTemplateIcons';
import { sanitizeLabelTemplateDefaults } from '@shared/utils/labelTemplateDefaults';
import { unknownMvtVariableNames, unknownDynamicSchemaNames, resolvePdfmeInputs } from '@shared/utils/labelTemplateInputs';
import {
  isLabelTemplateSlotEnabled,
  labelTemplateDefaultSlots,
} from '@shared/utils/labelTemplateDefaults';
import { applyLabelPreviewInputsToTemplate } from '@shared/pdfme/applyLabelPreviewInputsToTemplate';
import { preserveSchemaOnTypeChange } from '@shared/pdfme/preserveSchemaOnTypeChange';
import type { LabelInputMap } from '@shared/constants/labelInputKeys';
import { LabelTemplatePreviewProductPicker } from './Settings/labelTemplates/LabelTemplatePreviewProductPicker';
import {
  readLabelDesignerHideFieldOutlines,
  writeLabelDesignerHideFieldOutlines,
} from './Settings/labelTemplates/labelDesignerFieldOutlines';

const DESIGNER_ROTATE_SHIFT_SNAP_DEG = 15;

const CONFIRM_EXPAND_LABEL_CLASS =
  'overflow-hidden whitespace-nowrap transition-all duration-200 ease-out';
const CONFIRM_EXPAND_BUTTON_CLASS =
  'min-w-8 gap-0 overflow-hidden px-3.5 transition-[min-width,padding] duration-200 ease-out';

function isTemplateInDefaults(id: string, matrix: LabelTemplateDefaults): boolean {
  return labelTemplateDefaultSlots().some(({ audience, labelKind }) => matrix[audience][labelKind] === id);
}

export default function SettingsLabelTemplates() {
  const hostRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);
  const templateDraftRef = useRef<LabelPdfmeTemplate | null>(null);
  const selectedSchemasRef = useRef<DesignerSelectedSchemaRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<LabelTemplateDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('Порція');
  const [audience, setAudience] = useState<LabelTemplateAudience>('good');
  const [labelKind, setLabelKind] = useState<ProductLabelKind>('portion');
  const [isDeletionLocked, setIsDeletionLocked] = useState(false);
  const [iconKey, setIconKey] = useState<string | null>(DEFAULT_LABEL_TEMPLATE_ICON);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [defaults, setDefaults] = useState<LabelTemplateDefaults>({
    good: { portion: null, box: null },
    kit: { portion: null, box: null },
  });
  const [accordionKeys, setAccordionKeys] = useState<Set<string>>(new Set());
  const [goodOverrideCount, setGoodOverrideCount] = useState(0);
  const [productDrawerId, setProductDrawerId] = useState<string | null>(null);
  const [overridesTableKey, setOverridesTableKey] = useState(0);
  const [previewInputs, setPreviewInputs] = useState<LabelInputMap | null>(null);
  const [hideFieldOutlines, setHideFieldOutlines] = useState(() => readLabelDesignerHideFieldOutlines());
  const previewInputsRef = useRef<LabelInputMap | null>(null);
  const designerAssetsRef = useRef<Partial<Record<string, string>>>({});
  const designerTypeChangeGuardRef = useRef(false);

  const selectedTemplate = useMemo(
    () => templates.find((row) => row.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const isDefaultTemplate = selectedId ? isTemplateInDefaults(selectedId, defaults) : false;

  const deleteDisabledReason = useMemo(() => {
    if (!selectedId) return null;
    if (isDeletionLocked) return 'Зніміть блокування від видалення (перемикач нижче).';
    if (isDefaultTemplate) {
      const slots: string[] = [];
      for (const { audience: aud, labelKind: kind } of labelTemplateDefaultSlots()) {
        if (defaults[aud][kind] === selectedId) {
          slots.push(
            `${aud === 'kit' ? 'комплекти' : 'продукція'} · ${kind === 'portion' ? 'порція' : 'коробка'}`,
          );
        }
      }
      return `Шаблон у дефолтах (${slots.join(', ')}). Оберіть інший у «Дефолтні шаблони» і збережіть матрицю.`;
    }
    return null;
  }, [selectedId, isDeletionLocked, isDefaultTemplate, defaults]);

  const reload = async () => {
    const [rows, matrix] = await Promise.all([
      LabelTemplateService.list(),
      LabelTemplateService.getDefaults(),
    ]);
    setTemplates(rows);
    setDefaults(sanitizeLabelTemplateDefaults(matrix, rows));
    return rows;
  };

  useEffect(() => {
    if (templates.length === 0) return;
    setDefaults((prev) => sanitizeLabelTemplateDefaults(prev, templates));
  }, [templates]);

  useEffect(() => {
    void reload()
      .then((rows) => {
        if (rows[0]) setSelectedId(rows[0].id);
      })
      .catch((err: unknown) => {
        ToastService.show({
          title: 'Шаблони наліпок',
          description: err instanceof Error ? err.message : undefined,
          color: 'danger',
        });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setDeleteConfirm(false);
    setGoodOverrideCount(0);
    setOverridesTableKey((k) => k + 1);
    setPreviewInputs(null);
  }, [selectedId]);

  useEffect(() => {
    previewInputsRef.current = previewInputs;
  }, [previewInputs]);

  const applyDesignerPreviewContent = useCallback(() => {
    const designer = designerRef.current;
    if (!designer) return;
    const base = templateDraftRef.current ?? toLabelPdfmeTemplate(designer.getTemplate());
    const inputs = previewInputsRef.current;
    const next = inputs
      ? applyLabelPreviewInputsToTemplate(
          base,
          resolvePdfmeInputs(base, inputs),
          designerAssetsRef.current,
        )
      : hydrateLabelTemplateContent(base, designerAssetsRef.current);
    templateDraftRef.current = next;
    designer.updateTemplate(next as Template);
  }, []);

  useEffect(() => {
    applyDesignerPreviewContent();
  }, [previewInputs, applyDesignerPreviewContent]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    void (async () => {
      const [font, assets, detail] = await Promise.all([
        loadClientLabelFonts(),
        loadLabelDesignerAssets(),
        selectedId ? LabelTemplateService.get(selectedId) : Promise.resolve(null),
      ]);
      designerAssetsRef.current = assets;
      if (cancelled || !hostRef.current) return;
      const hostEl = hostRef.current;
      if (detail) {
        setName(detail.name);
        setAudience(detail.audience);
        setLabelKind(detail.labelKind);
        setIsDeletionLocked(detail.isDeletionLocked);
        setIconKey(detail.iconKey ?? DEFAULT_LABEL_TEMPLATE_ICON);
      } else {
        setIsDeletionLocked(false);
        setIconKey(DEFAULT_LABEL_TEMPLATE_ICON);
      }
      const template = hydrateLabelTemplateContent(
        toLabelPdfmeTemplate(detail?.template ?? buildPortionLabelTemplate()),
        assets,
      );
      designerRef.current?.destroy();
      selectedSchemasRef.current = [];

      const designer = new Designer({
        domContainer: hostEl,
        template: template as Template,
        plugins: createLabelPdfmePlugins(),
        options: { font },
      });
      designer.onChangeSelection((selection) => {
        selectedSchemasRef.current = selection.schemas.map((row) => ({
          name: row.name,
          pageIndex: row.pageIndex,
        }));
      });
      designer.onChangeTemplate((next) => {
        const nextTpl = toLabelPdfmeTemplate(next);
        if (designerTypeChangeGuardRef.current) {
          designerTypeChangeGuardRef.current = false;
          templateDraftRef.current = nextTpl;
          return;
        }
        const prev = templateDraftRef.current;
        const { template: preserved, changed } = preserveSchemaOnTypeChange(prev, nextTpl);
        templateDraftRef.current = preserved;
        if (changed) {
          designerTypeChangeGuardRef.current = true;
          designer.updateTemplate(preserved as Template);
        }
      });
      templateDraftRef.current = toLabelPdfmeTemplate(template);
      designerRef.current = designer;
      applyDesignerPreviewContent();

      if (cancelled) {
        designer.destroy();
        designerRef.current = null;
        return;
      }
    })().catch((err: unknown) => {
      ToastService.show({
        title: 'Designer',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    });
    return () => {
      cancelled = true;
      designerRef.current?.destroy();
      designerRef.current = null;
    };
  }, [selectedId, applyDesignerPreviewContent]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const syncDraftFromDom = () => {
      const designer = designerRef.current;
      if (!designer) return;
      const base = templateDraftRef.current ?? toLabelPdfmeTemplate(designer.getTemplate());
      templateDraftRef.current = syncLabelTemplateFromDesignerDom(host, base);
    };

    const opts: AddEventListenerOptions = { capture: true };
    host.addEventListener('pointerup', syncDraftFromDom, opts);
    host.addEventListener('pointercancel', syncDraftFromDom, opts);
    return () => {
      host.removeEventListener('pointerup', syncDraftFromDom, opts);
      host.removeEventListener('pointercancel', syncDraftFromDom, opts);
    };
  }, [selectedId]);

  const captureTemplateForSave = (): LabelPdfmeTemplate | null => {
    const designer = designerRef.current;
    const host = hostRef.current;
    if (!designer || !host) return null;
    const base = templateDraftRef.current ?? toLabelPdfmeTemplate(designer.getTemplate());
    return syncLabelTemplateFromDesignerDom(host, base);
  };

  const handleSave = async () => {
    const template = captureTemplateForSave();
    if (!template) return;

    const unknownMvt = unknownMvtVariableNames(template);
    if (unknownMvt.length > 0) {
      ToastService.show({
        title: 'Не вдалося зберегти шаблон',
        description: `Невідомі змінні у тексті: ${unknownMvt.join(', ')}. Перевірте {…} у MultiVariableText.`,
        color: 'danger',
      });
      return;
    }

    const unknownFieldNames = unknownDynamicSchemaNames(template);
    if (unknownFieldNames.length > 0) {
      ToastService.show({
        title: 'Підказка перед збереженням',
        description: `Поля ${unknownFieldNames.join(', ')} не з довідника inputs — макет збережеться, але дані з картки туди не підставляться. Для динаміки перейменуйте name на ключ з accordion нижче.`,
        color: 'warning',
      });
    }

    setSaving(true);
    try {
      const saved = await LabelTemplateService.save(selectedId, {
        name,
        audience,
        labelKind,
        template,
        isDeletionLocked,
        iconKey,
      });
      const assets = await loadLabelDesignerAssets();
      const hydrated = hydrateLabelTemplateContent(toLabelPdfmeTemplate(saved.template), assets);
      templateDraftRef.current = mergeLabelTemplateGeometry(template, hydrated);
      setSelectedId(saved.id);
      setIsDeletionLocked(saved.isDeletionLocked);
      setIconKey(saved.iconKey ?? DEFAULT_LABEL_TEMPLATE_ICON);
      await reload();
      ToastService.show({ title: 'Шаблон збережено', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося зберегти шаблон',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletionLockChange = async (next: boolean) => {
    if (!selectedId) {
      setIsDeletionLocked(next);
      return;
    }
    const prev = isDeletionLocked;
    setIsDeletionLocked(next);
    setSaving(true);
    try {
      const saved = await LabelTemplateService.save(selectedId, {
        name,
        audience,
        labelKind,
        isDeletionLocked: next,
        iconKey,
      });
      setIsDeletionLocked(saved.isDeletionLocked);
      await reload();
      ToastService.show({
        title: next ? 'Видалення заблоковано' : 'Блокування знято',
        color: 'success',
      });
    } catch (err) {
      setIsDeletionLocked(prev);
      ToastService.show({
        title: 'Не вдалося оновити блокування',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setDeleteConfirm(false);
    setSaving(true);
    try {
      await LabelTemplateService.archive(selectedId);
      const rows = await reload();
      const fallback =
        rows.find((row) => row.id !== selectedId && row.audience === audience && row.labelKind === labelKind) ??
        rows[0] ??
        null;
      setSelectedId(fallback?.id ?? null);
      ToastService.show({ title: 'Шаблон видалено', color: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined;
      if (message?.includes('привʼязано')) {
        setAccordionKeys((prev) => new Set([...prev, 'overrides']));
      }
      ToastService.show({
        title: 'Не вдалося видалити шаблон',
        description: message,
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDefaults = async () => {
    setSaving(true);
    try {
      const payload = sanitizeLabelTemplateDefaults(defaults, templates);
      setDefaults(payload);
      const matrix = await LabelTemplateService.saveDefaults(payload);
      setDefaults(matrix);
      ToastService.show({ title: 'Дефолти збережено', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося зберегти дефолти',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <DynamicIcon name="loader-2" className="mr-2 h-6 w-6 animate-spin text-gray-400" />
        <span className="text-gray-500">Завантаження шаблонів…</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="w-full">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
          <div className="flex flex-wrap items-center gap-2">
            <LabelTemplateIcon
              iconKey={selectedTemplate?.iconKey ?? iconKey}
              size={18}
              className="text-gray-600"
            />
            <h2 className="text-base font-semibold text-gray-900">Шаблони наліпок</h2>
            {selectedTemplate?.isDeletionLocked ? (
              <Chip size="sm" variant="flat" color="warning">захищено</Chip>
            ) : null}
            {isDefaultTemplate && selectedId ? (
              <Chip size="sm" variant="flat" color="primary">дефолт</Chip>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Tooltip content="Зберегти шаблон" placement="top">
              <Button
                isIconOnly
                size="md"
                color="primary"
                aria-label="Зберегти шаблон"
                onPress={() => void handleSave()}
                isLoading={saving}
              >
                {!saving ? <DynamicIcon name="save" size={18} /> : null}
              </Button>
            </Tooltip>
            <Tooltip content="Новий шаблон" placement="top">
              <Button
                isIconOnly
                size="md"
                variant="flat"
                data-btn-tone="primary-blue-solid"
                aria-label="Новий шаблон"
                onPress={() => {
                  setSelectedId(null);
                  setName('Новий шаблон');
                  setIconKey(DEFAULT_LABEL_TEMPLATE_ICON);
                  setDeleteConfirm(false);
                }}
                isDisabled={saving}
              >
                <DynamicIcon name="plus" size={18} />
              </Button>
            </Tooltip>
            {selectedId ? (
              <Tooltip content="Дублювати шаблон" placement="top">
                <Button
                  isIconOnly
                  size="md"
                  variant="flat"
                  data-btn-tone="primary-blue-solid"
                  aria-label="Дублювати шаблон"
                  isDisabled={saving}
                  onPress={() => {
                    void LabelTemplateService.duplicate(selectedId).then(async (copy) => {
                      await reload();
                      setSelectedId(copy.id);
                    });
                  }}
                >
                  <DynamicIcon name="copy" size={18} />
                </Button>
              </Tooltip>
            ) : null}
            {selectedId ? (
              <Tooltip
                content={deleteDisabledReason ?? (deleteConfirm ? 'Підтвердити видалення' : 'Видалити шаблон')}
                placement="top"
              >
                <span className="inline-flex">
                  <Button
                    isIconOnly={!deleteConfirm}
                    size="md"
                    variant="flat"
                    color="danger"
                    className={deleteConfirm ? CONFIRM_EXPAND_BUTTON_CLASS : undefined}
                    aria-label={deleteConfirm ? 'Підтвердити видалення шаблону' : 'Видалити шаблон'}
                    isDisabled={saving || deleteDisabledReason != null}
                    onPress={() => void handleDelete()}
                  >
                    <DynamicIcon name="trash-2" size={18} className="shrink-0" />
                    {deleteConfirm ? (
                      <span className={[CONFIRM_EXPAND_LABEL_CLASS, 'ml-2 max-w-[4.5rem] opacity-100'].join(' ')}>
                        Видалити?
                      </span>
                    ) : null}
                  </Button>
                </span>
              </Tooltip>
            ) : null}
          </div>
        </CardHeader>
        <CardBody className="space-y-5 p-6">
          <div className="rounded-xl border border-default-200 bg-default-50/40 p-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
              <Select
                className="xl:col-span-4"
                label="Шаблон"
                labelPlacement="outside"
                classNames={{ label: 'font-semibold text-sm' }}
                selectedKeys={selectedId ? [selectedId] : []}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];
                  setSelectedId(key ? String(key) : null);
                }}
              >
                {templates.map((row) => (
                  <SelectItem
                    key={row.id}
                    textValue={row.name}
                    startContent={
                      <LabelTemplateIcon iconKey={row.iconKey} size={14} className="text-default-500" />
                    }
                  >
                    {row.name}
                  </SelectItem>
                ))}
              </Select>
              <Input
                className="xl:col-span-4"
                label="Назва"
                labelPlacement="outside"
                classNames={{ label: 'font-semibold text-sm' }}
                value={name}
                onValueChange={setName}
              />
              <Select
                className="xl:col-span-2"
                label="Аудиторія"
                labelPlacement="outside"
                classNames={{ label: 'font-semibold text-sm' }}
                selectedKeys={[audience]}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];
                  if (key === 'good' || key === 'kit') {
                    setAudience(key);
                    if (key === 'kit' && labelKind === 'box') setLabelKind('portion');
                  }
                }}
              >
                <SelectItem key="good">Продукція</SelectItem>
                <SelectItem key="kit">Комплекти</SelectItem>
              </Select>
              <Select
                className="xl:col-span-2"
                label="Слот"
                labelPlacement="outside"
                classNames={{ label: 'font-semibold text-sm' }}
                selectedKeys={[labelKind]}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];
                  if (key === 'portion' || key === 'box') setLabelKind(key);
                }}
              >
                <SelectItem key="portion">Порція</SelectItem>
                {isLabelTemplateSlotEnabled(audience, 'box') ? (
                  <SelectItem key="box">Коробка</SelectItem>
                ) : null}
              </Select>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-default-200/80 pt-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">Іконка в списку</span>
                <LabelTemplateIconPicker
                  value={iconKey}
                  onChange={(next: LabelTemplateIconKey) => setIconKey(next)}
                  isDisabled={saving}
                />
              </div>
              {selectedId ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-default-500 max-w-[220px] hidden sm:inline">
                    Додатковий захист від видалення
                  </span>
                  <Switch
                    size="sm"
                    isSelected={isDeletionLocked}
                    onValueChange={(value) => void handleDeletionLockChange(value)}
                    isDisabled={saving}
                  >
                    Заблокувати
                  </Switch>
                </div>
              ) : null}
            </div>
          </div>

          {selectedId && isDefaultTemplate ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/60 px-4 py-2.5 text-sm text-default-700">
              <DynamicIcon name="info" size={16} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                Шаблон — <strong>дефолт</strong> для аудиторія/слот. Для видалення змініть матрицю нижче.
              </span>
              <Button
                size="sm"
                variant="flat"
                color="primary"
                className="shrink-0"
                onPress={() => setAccordionKeys((prev) => new Set([...prev, 'defaults']))}
              >
                До дефолтів
              </Button>
            </div>
          ) : null}

          <Divider />

          <Accordion
            variant="splitted"
            selectionMode="multiple"
            selectedKeys={accordionKeys}
            onSelectionChange={(keys) => {
              if (keys === 'all') {
                setAccordionKeys(new Set(['defaults', 'overrides', 'fields']));
                return;
              }
              setAccordionKeys(new Set(Array.from(keys).map(String)));
            }}
          >
            {selectedId ? (
              <AccordionItem
                key="overrides"
                aria-label="Привʼязки до товарів"
                title={
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
                    <DynamicIcon name="link-2" size={16} className="text-gray-600" />
                    Привʼязки на картках товарів
                    {goodOverrideCount > 0 ? (
                      <Chip size="sm" variant="flat" color="warning">{goodOverrideCount}</Chip>
                    ) : null}
                  </span>
                }
              >
                <p className="mb-3 text-xs text-default-500">
                  Прямий override пресета на вкладці наліпок. Після відвʼязки товар отримає дефолтний
                  шаблон для своєї аудиторії та слоту.
                </p>
                <LabelTemplateGoodOverridesTable
                  key={`${selectedId}-${overridesTableKey}`}
                  templateId={selectedId}
                  onOpenGood={setProductDrawerId}
                  onCountChange={setGoodOverrideCount}
                />
              </AccordionItem>
            ) : null}
            <AccordionItem
              key="defaults"
              aria-label="Дефолтні шаблони"
              title={
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <DynamicIcon name="layout-grid" size={16} className="text-gray-600" />
                  Дефолтні шаблони (продукція: порція і коробка; комплекти: порція)
                </span>
              }
            >
              <p className="mb-3 text-xs text-default-500">
                Очистіть поле (×), щоб відвʼязати дефолт для комбінації. Порожній слот — товари без
                override отримають «немає дефолту» до нового вибору.
              </p>
              <div className="grid gap-3 pb-2 sm:grid-cols-2">
                {labelTemplateDefaultSlots().map(({ audience: aud, labelKind: kind }) => {
                    const slotOptions = templates.filter(
                      (row) => row.audience === aud && row.labelKind === kind,
                    );
                    const rawId = defaults[aud][kind];
                    const selectedIdForSlot =
                      rawId && slotOptions.some((row) => row.id === rawId) ? rawId : null;

                    return (
                    <Select
                      key={`${aud}-${kind}`}
                      label={`${aud === 'kit' ? 'Комплекти' : 'Продукція'} · ${kind === 'portion' ? 'порція' : 'коробка'}`}
                      labelPlacement="outside"
                      placeholder="Не обрано"
                      isClearable
                      selectedKeys={selectedIdForSlot ? [selectedIdForSlot] : []}
                      onClear={() => {
                        setDefaults((prev) => ({
                          ...prev,
                          [aud]: { ...prev[aud], [kind]: null },
                        }));
                      }}
                      onSelectionChange={(keys) => {
                        if (keys === 'all') return;
                        const key = Array.from(keys)[0];
                        setDefaults((prev) => ({
                          ...prev,
                          [aud]: { ...prev[aud], [kind]: key ? String(key) : null },
                        }));
                      }}
                    >
                      {slotOptions.map((row) => (
                          <SelectItem
                            key={row.id}
                            textValue={row.name}
                            startContent={
                              <LabelTemplateIcon
                                iconKey={row.iconKey}
                                size={14}
                                className="text-default-500"
                              />
                            }
                          >
                            {row.name}
                          </SelectItem>
                        ))}
                    </Select>
                    );
                })}
              </div>
              <Button
                size="sm"
                variant="flat"
                className="mt-3"
                data-btn-tone="primary-blue-solid"
                onPress={() => void handleSaveDefaults()}
                isDisabled={saving}
              >
                Зберегти дефолти
              </Button>
            </AccordionItem>

            <AccordionItem
              key="fields"
              aria-label="Поля та змінні"
              title={
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <DynamicIcon name="braces" size={16} className="text-gray-600" />
                  Імена полів і змінні MultiVariableText
                </span>
              }
            >
              <div className="grid gap-4 pb-2 lg:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-default-600">
                  <p className="mb-2 font-semibold text-gray-900">Імʼя поля (name)</p>
                  <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                    {LABEL_INPUT_KEYS.map((key) => (
                      <li key={key}>
                        <span className="font-mono">{key}</span> — {LABEL_INPUT_LABELS[key]}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-default-700">
                  <p className="mb-2 font-semibold text-gray-900">Змінні у тексті</p>
                  <p className="mb-2 text-default-600">
                    Приклад: <span className="font-mono">Калораж {'{kcal}'} ккал</span>
                  </p>
                  <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                    {LABEL_MVT_VARIABLE_KEYS.map((key) => (
                      <li key={key}>
                        <span className="font-mono">{`{${key}}`}</span> — {LABEL_MVT_VARIABLE_LABELS[key]}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AccordionItem>
          </Accordion>
        </CardBody>
      </Card>

      <Card className="w-full">
        <CardHeader className="flex flex-col items-stretch gap-4 border-b border-gray-200">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <DynamicIcon name="scan-line" size={18} className="text-gray-600" />
                <h2 className="text-base font-semibold text-gray-900">Макет наліпки</h2>
              </div>
              <p className="mt-1 text-xs text-default-500">
                100×100 мм · Shift + поворот {DESIGNER_ROTATE_SHIFT_SNAP_DEG}° · оберіть товар для живого
                перегляду
              </p>
            </div>
            <Tooltip
              content="Пунктирні outline-рамки навколо полів у pdfme Designer. Виділення активного поля лишається."
              placement="top"
            >
              <Switch
                size="sm"
                isSelected={hideFieldOutlines}
                onValueChange={(value) => {
                  setHideFieldOutlines(value);
                  writeLabelDesignerHideFieldOutlines(value);
                }}
              >
                Приховати рамки полів
              </Switch>
            </Tooltip>
          </div>
          <div className="w-full sm:max-w-2xl">
            <LabelTemplatePreviewProductPicker
              previewInputs={previewInputs}
              onPreviewInputsChange={setPreviewInputs}
              labelKind={labelKind}
              disabled={saving}
            />
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <div
            ref={hostRef}
            className={[
              'label-pdfme-designer-host min-h-[820px] w-full overflow-hidden border-t border-gray-100 bg-default-50',
              hideFieldOutlines ? 'label-pdfme-hide-field-outlines' : '',
            ].join(' ')}
          />
        </CardBody>
      </Card>

      <MovementMobProductEditDrawer
        catalogGoodId={productDrawerId}
        open={Boolean(productDrawerId)}
        onClose={() => setProductDrawerId(null)}
        onSaved={() => setOverridesTableKey((k) => k + 1)}
      />
    </div>
  );
}
