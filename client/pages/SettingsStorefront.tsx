import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
  Tab,
  Tabs,
} from '@heroui/react';
import { ToastService } from '@/services/ToastService';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import { storefrontApi, STOREFRONT_SETTINGS_UPDATED_EVENT } from '../services/StorefrontService';
import { DescriptionEditor } from './Products/components/DescriptionEditor';
import { KitComponentsTemplateEditor } from '@/components/storefront/KitComponentsTemplateEditor';
import { BTN_PRIMARY_BLUE } from '@/lib/buttonStyles';
import type {
  StorefrontBlockConfig,
  StorefrontKitComponentCategoryConfig,
  StorefrontKitComponentSettings,
  StorefrontMetaKeyConfig,
  StorefrontPresetDto,
  StorefrontSettingsDto,
} from '@shared/types/storefront';
import {
  STOREFRONT_DEFAULT_BLOCKS,
  STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS,
  STOREFRONT_RESOLVER_HINTS,
  createCustomKitComponentCategory,
  createCustomStorefrontBlock,
  createCustomStorefrontMetaKey,
  getStorefrontDefaultBlockTemplate,
  hasStorefrontDefaultBlockTemplate,
  kitComponentSettingsEqual,
  metaKeysEqual,
  normalizeStorefrontBlocks,
  normalizeStorefrontKitComponentSettings,
  normalizeStorefrontMetaKeys,
  storefrontBlockUsesTemplate,
  isStorefrontProtectedBlockId,
} from '@shared/constants/storefrontDefaults';
import { getStorefrontResolverPrimaryPlaceholder } from '@shared/utils/storefrontDescription';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { KitComponentsTemplateHelp } from '@/components/storefront/KitComponentsTemplateHelp';
import MetaLogJsonView from '@/components/MetaLogJsonView';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import type { StorefrontWooConnectionStatus, WooInspectResult } from '@shared/types/storefront';
import {
  CATALOG_FINISHED_PRODUCTS_FOLDER_ID,
  type CatalogTreeNodeDto,
} from '@shared/types/catalog';

type InspectViewTab = 'summary' | 'raw';

function blocksEqual(a: StorefrontBlockConfig[], b: StorefrontBlockConfig[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const CONFIRM_EXPAND_LABEL_CLASS =
  'overflow-hidden whitespace-nowrap transition-all duration-200 ease-out';
const CONFIRM_EXPAND_BUTTON_CLASS =
  'min-w-8 gap-0 overflow-hidden px-3.5 transition-[min-width,padding] duration-200 ease-out';

const SettingsStorefront: React.FC = () => {
  const { hasPermission } = useRoleAccess();
  const canManage = hasPermission(PERMISSIONS.ACTION_STOREFRONT_MANAGE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<StorefrontPresetDto[]>([]);
  const [savedSettings, setSavedSettings] = useState<StorefrontSettingsDto | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [editBlocks, setEditBlocks] = useState<StorefrontBlockConfig[]>([]);
  const [savedBlocks, setSavedBlocks] = useState<StorefrontBlockConfig[]>([]);
  const [editMetaKeys, setEditMetaKeys] = useState<StorefrontMetaKeyConfig[]>([]);
  const [savedMetaKeys, setSavedMetaKeys] = useState<StorefrontMetaKeyConfig[]>([]);
  const [editKitSettings, setEditKitSettings] = useState<StorefrontKitComponentSettings>(
    STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS,
  );
  const [savedKitSettings, setSavedKitSettings] = useState<StorefrontKitComponentSettings>(
    STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS,
  );
  const [deleteKitCategoryConfirmId, setDeleteKitCategoryConfirmId] = useState<string | null>(null);
  const [pendingDefaultPresetId, setPendingDefaultPresetId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [deletePresetConfirm, setDeletePresetConfirm] = useState(false);
  const [addPresetConfirm, setAddPresetConfirm] = useState(false);
  const [deleteBlockConfirmId, setDeleteBlockConfirmId] = useState<string | null>(null);
  const [deleteMetaKeyConfirmId, setDeleteMetaKeyConfirmId] = useState<string | null>(null);
  const [editingBlockLabelId, setEditingBlockLabelId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [blocksRevision, setBlocksRevision] = useState(0);
  const [wooSiteUrl, setWooSiteUrl] = useState('');
  const [wooMediaPublicBaseUrl, setWooMediaPublicBaseUrl] = useState('');
  const [wooConsumerKey, setWooConsumerKey] = useState('');
  const [wooConsumerSecret, setWooConsumerSecret] = useState('');
  const [wooEnabled, setWooEnabled] = useState(false);
  const [wooEnabledSaving, setWooEnabledSaving] = useState(false);
  const [wooHasSecret, setWooHasSecret] = useState(false);
  const [wooTesting, setWooTesting] = useState(false);
  const [wooTestStatus, setWooTestStatus] = useState<StorefrontWooConnectionStatus | null>(null);
  const [wooTestError, setWooTestError] = useState<string | null>(null);
  const [wooSaveConfirm, setWooSaveConfirm] = useState(false);
  const [wooSaving, setWooSaving] = useState(false);
  const [inspectSku, setInspectSku] = useState('');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectData, setInspectData] = useState<WooInspectResult | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectViewTab, setInspectViewTab] = useState<InspectViewTab>('summary');
  const [orphanLoading, setOrphanLoading] = useState(false);
  const [orphanResult, setOrphanResult] = useState<string | null>(null);
  const [orphanDeleteConfirm, setOrphanDeleteConfirm] = useState(false);
  const [orphanIds, setOrphanIds] = useState<number[]>([]);
  const [finishedProductFolders, setFinishedProductFolders] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [presetRows, settingsRow, treeRes] = await Promise.all([
        storefrontApi.listPresets(),
        storefrontApi.getSettings(),
        fetch('/api/catalog/tree', { credentials: 'include' }),
      ]);
      setPresets(presetRows);
      setSavedSettings(settingsRow);
      setWooSiteUrl(settingsRow.wooCommerce.siteUrl);
      setWooMediaPublicBaseUrl(settingsRow.wooCommerce.mediaPublicBaseUrl);
      setWooConsumerKey(settingsRow.wooCommerce.consumerKey);
      setWooConsumerSecret('');
      setWooEnabled(settingsRow.wooCommerce.enabled);
      setWooHasSecret(settingsRow.wooCommerce.hasConsumerSecret);
      setWooTestStatus(settingsRow.wooCommerce.connectionStatus ?? null);
      setPendingDefaultPresetId(settingsRow.defaultPresetId);
      setEditMetaKeys([...settingsRow.metaKeys]);
      setSavedMetaKeys([...settingsRow.metaKeys]);
      setEditKitSettings(settingsRow.kitComponentSettings);
      setSavedKitSettings(settingsRow.kitComponentSettings);

      if (treeRes.ok) {
        const treeJson = (await treeRes.json()) as { data?: CatalogTreeNodeDto[] };
        const folders = (treeJson.data ?? [])
          .filter(
            (node) =>
              node.parentId === CATALOG_FINISHED_PRODUCTS_FOLDER_ID &&
              node.isGroup &&
              !node.delMark,
          )
          .sort(
            (a, b) =>
              (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
              a.name.localeCompare(b.name, 'uk'),
          )
          .map((node) => ({ id: node.id, name: node.name }));
        setFinishedProductFolders(folders);
      } else {
        setFinishedProductFolders([]);
      }

      setSelectedPresetId((currentId) => {
        const active =
          presetRows.find((p) => p.id === currentId)?.id ||
          presetRows.find((p) => p.id === settingsRow.defaultPresetId)?.id ||
          presetRows.find((p) => p.isDefault)?.id ||
          presetRows[0]?.id ||
          null;
        const preset = presetRows.find((p) => p.id === active);
        const blocks = normalizeStorefrontBlocks(
          preset?.blocks || [...STOREFRONT_DEFAULT_BLOCKS],
          settingsRow.metaKeys,
        );
        setEditBlocks(blocks);
        setSavedBlocks(blocks);
        return active;
      });
      setJustSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка завантаження налаштувань');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPreset = presets.find((p) => p.id === selectedPresetId) || null;

  const hasChanges = useMemo(() => {
    if (!savedSettings) return false;
    return (
      !blocksEqual(editBlocks, savedBlocks) ||
      !metaKeysEqual(editMetaKeys, savedMetaKeys) ||
      !kitComponentSettingsEqual(editKitSettings, savedKitSettings) ||
      pendingDefaultPresetId !== savedSettings.defaultPresetId
    );
  }, [
    editBlocks,
    savedBlocks,
    editMetaKeys,
    savedMetaKeys,
    editKitSettings,
    savedKitSettings,
    savedSettings,
    pendingDefaultPresetId,
  ]);

  const wooCredentialsDirty = useMemo(() => {
    if (!savedSettings) return false;
    const saved = savedSettings.wooCommerce;
    if (wooSiteUrl.trim() !== saved.siteUrl.trim()) return true;
    if (wooMediaPublicBaseUrl.trim() !== saved.mediaPublicBaseUrl.trim()) return true;
    if (wooConsumerKey.trim() !== saved.consumerKey.trim()) return true;
    if (wooConsumerSecret.trim()) return true;
    return false;
  }, [savedSettings, wooSiteUrl, wooMediaPublicBaseUrl, wooConsumerKey, wooConsumerSecret]);

  const metaKeyOptions = useMemo(
    () => [
      { id: '', label: '— лише в описі —' },
      ...editMetaKeys.map((row) => ({
        id: row.id,
        label: `${row.label} (${row.key})`,
      })),
    ],
    [editMetaKeys],
  );

  const markDirty = () => {
    setJustSaved(false);
  };

  const updateBlock = (id: string, patch: Partial<StorefrontBlockConfig>) => {
    setEditBlocks((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    markDirty();
  };

  const updateMetaKey = (id: string, patch: Partial<StorefrontMetaKeyConfig>) => {
    setEditMetaKeys((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    markDirty();
  };

  const updateKitCategory = (id: string, patch: Partial<StorefrontKitComponentCategoryConfig>) => {
    setEditKitSettings((settings) => ({
      ...settings,
      categories: settings.categories.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
    markDirty();
  };

  const updateKitFallback = (patch: Partial<StorefrontKitComponentSettings>) => {
    setEditKitSettings((settings) => ({ ...settings, ...patch }));
    markDirty();
  };

  const sortedKitCategories = useMemo(
    () =>
      [...editKitSettings.categories].sort(
        (a, b) => a.order - b.order || a.label.localeCompare(b.label, 'uk'),
      ),
    [editKitSettings.categories],
  );

  const handleKitCategoryDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const next = [...sortedKitCategories];
    const [removed] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, removed);
    const reordered = next.map((row, index) => ({ ...row, order: index + 1 }));
    setEditKitSettings((settings) => ({ ...settings, categories: reordered }));
    markDirty();
  };

  const usedKitCategoryLabels = useMemo(
    () => new Set(sortedKitCategories.map((row) => row.label.trim()).filter(Boolean)),
    [sortedKitCategories],
  );

  const handleAddKitCategory = () => {
    const nextOrder = sortedKitCategories.length + 1;
    setEditKitSettings((settings) => ({
      ...settings,
      categories: [...settings.categories, createCustomKitComponentCategory('', nextOrder)],
    }));
    setDeleteKitCategoryConfirmId(null);
    markDirty();
  };

  const handleDeleteKitCategory = (id: string) => {
    if (deleteKitCategoryConfirmId !== id) {
      setDeleteKitCategoryConfirmId(id);
      return;
    }
    setEditKitSettings((settings) => ({
      ...settings,
      categories: settings.categories.filter((row) => row.id !== id),
    }));
    setDeleteKitCategoryConfirmId(null);
    markDirty();
  };

  const handleSelectPreset = (id: string, presetOverride?: StorefrontPresetDto) => {
    setDeletePresetConfirm(false);
    setAddPresetConfirm(false);
    setDeleteBlockConfirmId(null);
    setIsAddingPreset(false);
    setNewPresetName('');
    setSelectedPresetId(id);
    const preset = presetOverride ?? presets.find((p) => p.id === id);
    const blocks = normalizeStorefrontBlocks(
      preset?.blocks || [...STOREFRONT_DEFAULT_BLOCKS],
      editMetaKeys,
    );
    setEditBlocks(blocks);
    setSavedBlocks(blocks);
    setJustSaved(false);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const next = [...editBlocks];
    const [removed] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, removed);
    setEditBlocks(next);
    markDirty();
  };

  const toggleBlock = (id: string) => {
    setEditBlocks((rows) =>
      rows.map((row) => (row.id === id ? { ...row, enabled: !row.enabled } : row)),
    );
    markDirty();
  };

  const handleAddBlock = () => {
    setEditBlocks((rows) => [...rows, createCustomStorefrontBlock()]);
    setDeleteBlockConfirmId(null);
    markDirty();
  };

  const handleDeleteBlock = (id: string) => {
    if (isStorefrontProtectedBlockId(id)) return;
    if (deleteBlockConfirmId !== id) {
      setDeleteBlockConfirmId(id);
      return;
    }
    setEditBlocks((rows) => rows.filter((row) => row.id !== id));
    setDeleteBlockConfirmId(null);
    markDirty();
  };

  const handleAddMetaKey = () => {
    setEditMetaKeys((rows) => [...rows, createCustomStorefrontMetaKey()]);
    setDeleteMetaKeyConfirmId(null);
    markDirty();
  };

  const handleDeleteMetaKey = (id: string) => {
    if (deleteMetaKeyConfirmId !== id) {
      setDeleteMetaKeyConfirmId(id);
      return;
    }
    setEditMetaKeys((rows) => rows.filter((row) => row.id !== id));
    setEditBlocks((rows) =>
      rows.map((row) => (row.metaKeyId === id ? { ...row, metaKeyId: null } : row)),
    );
    setDeleteMetaKeyConfirmId(null);
    markDirty();
  };

  const handleSetDefaultPreset = (id: string) => {
    setPendingDefaultPresetId(id);
    markDirty();
  };

  const startAddingPreset = () => {
    setDeletePresetConfirm(false);
    setAddPresetConfirm(false);
    setIsAddingPreset(true);
    setNewPresetName('');
  };

  const cancelAddingPreset = () => {
    setIsAddingPreset(false);
    setAddPresetConfirm(false);
    setNewPresetName('');
  };

  const createPreset = async () => {
    const name = newPresetName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const created = await storefrontApi.createPreset({
        name,
        blocks: normalizeStorefrontBlocks([...editBlocks], editMetaKeys),
      });
      setPresets((rows) => [...rows, created]);
      setIsAddingPreset(false);
      setNewPresetName('');
      handleSelectPreset(created.id, created);
      ToastService.show({ title: 'Preset створено', color: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      ToastService.show({ title: 'Помилка створення', description: message, color: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const deletePreset = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await storefrontApi.deletePreset(id);
      setIsAddingPreset(false);
      setNewPresetName('');
      await load();
      ToastService.show({ title: 'Preset видалено', color: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      ToastService.show({ title: 'Помилка видалення', description: message, color: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!savedSettings) return;
    setEditBlocks([...savedBlocks]);
    setEditMetaKeys([...savedMetaKeys]);
    setEditKitSettings(savedKitSettings);
    setPendingDefaultPresetId(savedSettings.defaultPresetId);
    setIsAddingPreset(false);
    setDeletePresetConfirm(false);
    setAddPresetConfirm(false);
    setDeleteBlockConfirmId(null);
    setDeleteMetaKeyConfirmId(null);
    setDeleteKitCategoryConfirmId(null);
    setNewPresetName('');
    setJustSaved(false);
    void load();
  };

  const handleWooTest = async () => {
    setWooTesting(true);
    setWooTestError(null);
    try {
      const result = await storefrontApi.testWooConnection({
        siteUrl: wooSiteUrl,
        consumerKey: wooConsumerKey,
        consumerSecret: wooConsumerSecret || undefined,
      });
      if (result.ok) {
        setWooTestStatus('ok');
        ToastService.show({
          title: 'Підключення успішне',
          description: result.wcVersion ? `WC ${result.wcVersion}` : undefined,
          color: 'success',
        });
      } else {
        setWooTestStatus('error');
        setWooTestError(result.error || 'Помилка підключення');
        ToastService.show({ title: 'Помилка підключення', description: result.error, color: 'danger' });
      }
    } catch (err) {
      setWooTestStatus('error');
      const message = err instanceof Error ? err.message : String(err);
      setWooTestError(message);
      ToastService.show({ title: 'Помилка підключення', description: message, color: 'danger' });
    } finally {
      setWooTesting(false);
    }
  };

  const handleWooEnabledChange = async (next: boolean) => {
    const prev = wooEnabled;
    setWooEnabled(next);
    setWooEnabledSaving(true);
    setError(null);
    try {
      const settings = await storefrontApi.updateSettings({
        wooCommerce: { enabled: next },
      });
      setSavedSettings(settings);
      setWooEnabled(settings.wooCommerce.enabled);
      setWooTestStatus(settings.wooCommerce.connectionStatus ?? null);
      ToastService.show({
        title: next ? 'Інтеграцію увімкнено' : 'Інтеграцію вимкнено',
        color: 'success',
      });
    } catch (err) {
      setWooEnabled(prev);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      ToastService.show({ title: 'Помилка збереження', description: message, color: 'danger' });
    } finally {
      setWooEnabledSaving(false);
    }
  };

  const handleWooSave = async () => {
    setWooSaving(true);
    setError(null);
    try {
      const next = await storefrontApi.updateSettings({
        wooCommerce: {
          siteUrl: wooSiteUrl,
          mediaPublicBaseUrl: wooMediaPublicBaseUrl,
          consumerKey: wooConsumerKey,
          consumerSecret: wooConsumerSecret || undefined,
        },
      });
      setSavedSettings(next);
      setWooHasSecret(next.wooCommerce.hasConsumerSecret);
      setWooConsumerSecret('');
      setWooSaveConfirm(false);
      ToastService.show({ title: 'Credentials збережено', color: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      ToastService.show({ title: 'Помилка збереження', description: message, color: 'danger' });
    } finally {
      setWooSaving(false);
    }
  };

  const handleInspect = async () => {
    const sku = inspectSku.trim();
    if (!sku) return;
    setInspectLoading(true);
    setInspectData(null);
    setInspectError(null);
    setInspectViewTab('summary');
    try {
      const result = await storefrontApi.inspectWooProduct(sku);
      setInspectData(result);
      ToastService.show({ title: 'Inspect завершено', color: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInspectError(message);
      ToastService.show({ title: 'Помилка inspect', description: message, color: 'danger' });
    } finally {
      setInspectLoading(false);
    }
  };

  const handleOrphanAudit = async () => {
    setOrphanLoading(true);
    setOrphanResult(null);
    setOrphanIds([]);
    try {
      const result = await storefrontApi.auditWooOrphans();
      setOrphanIds(result.orphans.map((row) => row.wooMediaId));
      setOrphanResult(
        `Знайдено ${result.orphans.length} orphan з ${result.totalWcImages} WC media`,
      );
    } catch (err) {
      setOrphanResult(err instanceof Error ? err.message : String(err));
    } finally {
      setOrphanLoading(false);
    }
  };

  const handleOrphanDelete = async () => {
    if (orphanIds.length === 0) return;
    setOrphanLoading(true);
    try {
      const result = await storefrontApi.deleteWooOrphans(orphanIds);
      setOrphanDeleteConfirm(false);
      setOrphanResult(`Видалено ${result.deleted}. Помилок: ${result.errors.length}`);
      setOrphanIds([]);
      ToastService.show({ title: 'Orphan cleanup завершено', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Помилка видалення',
        description: err instanceof Error ? err.message : String(err),
        color: 'danger',
      });
    } finally {
      setOrphanLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPreset || !savedSettings) return;
    setSaving(true);
    setError(null);
    try {
      const normalizedMetaKeys = normalizeStorefrontMetaKeys(editMetaKeys);
      const normalizedKitSettings = normalizeStorefrontKitComponentSettings(editKitSettings);
      const normalizedBlocks = normalizeStorefrontBlocks(editBlocks, normalizedMetaKeys);
      const tasks: Promise<unknown>[] = [];

      if (!metaKeysEqual(normalizedMetaKeys, savedMetaKeys)) {
        tasks.push(
          storefrontApi.updateSettings({ metaKeys: normalizedMetaKeys }).then((next) => {
            setSavedSettings(next);
            setEditMetaKeys([...next.metaKeys]);
            setSavedMetaKeys([...next.metaKeys]);
          }),
        );
      }

      if (!kitComponentSettingsEqual(normalizedKitSettings, savedKitSettings)) {
        tasks.push(
          storefrontApi.updateSettings({ kitComponentSettings: normalizedKitSettings }).then((next) => {
            setSavedSettings(next);
            setEditKitSettings(next.kitComponentSettings);
            setSavedKitSettings(next.kitComponentSettings);
          }),
        );
      }

      if (!blocksEqual(normalizedBlocks, savedBlocks)) {
        tasks.push(
          storefrontApi
            .updatePreset(selectedPreset.id, { blocks: normalizedBlocks })
            .then((updated) => {
              const blocks = normalizeStorefrontBlocks(updated.blocks, normalizedMetaKeys);
              setPresets((rows) => rows.map((p) => (p.id === updated.id ? updated : p)));
              setEditBlocks(blocks);
              setSavedBlocks(blocks);
              setBlocksRevision((revision) => revision + 1);
            }),
        );
      }

      if (pendingDefaultPresetId !== savedSettings.defaultPresetId) {
        tasks.push(
          storefrontApi.updateSettings({ defaultPresetId: pendingDefaultPresetId }).then((next) => {
            setSavedSettings(next);
            setPendingDefaultPresetId(next.defaultPresetId);
            setPresets((rows) =>
              rows.map((p) => ({ ...p, isDefault: p.id === next.defaultPresetId })),
            );
          }),
        );
      }

      await Promise.all(tasks);
      window.dispatchEvent(new Event(STOREFRONT_SETTINGS_UPDATED_EVENT));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const isDefaultPending = useMemo(
    () => selectedPreset != null && pendingDefaultPresetId === selectedPreset.id,
    [pendingDefaultPresetId, selectedPreset],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <DynamicIcon name="loader-2" className="w-6 h-6 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-500">Завантаження налаштувань...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <DynamicIcon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <aside className="space-y-4 lg:col-span-2">
          <Card className="w-full">
            <CardHeader className="border-b border-gray-200 flex items-center gap-2">
              <DynamicIcon name="plug" size={18} className="text-gray-600" />
              <h2 className="text-base font-semibold text-gray-900">WooCommerce API</h2>
              {wooTestStatus === 'ok' && (
                <Chip size="sm" variant="flat" color="success">OK</Chip>
              )}
              {wooTestStatus === 'error' && (
                <Chip size="sm" variant="flat" color="danger">Error</Chip>
              )}
            </CardHeader>
            <CardBody className="p-6 space-y-4">
              <Switch
                isSelected={wooEnabled}
                onValueChange={(value) => void handleWooEnabledChange(value)}
                isDisabled={!canManage || wooEnabledSaving}
              >
                Увімкнути інтеграцію
              </Switch>
              <Input
                label="URL магазину"
                labelPlacement="outside"
                value={wooSiteUrl}
                onValueChange={setWooSiteUrl}
                isDisabled={!canManage}
                placeholder="https://nk-food.shop"
              />
              <Input
                label="URL backoffice для медіа"
                labelPlacement="outside"
                description="Публічна адреса backoffice, звідки WooCommerce завантажує /uploads/catalog/…"
                value={wooMediaPublicBaseUrl}
                onValueChange={setWooMediaPublicBaseUrl}
                isDisabled={!canManage}
                placeholder="https://backoffice.nk-food.shop"
              />
              <Input
                label="Consumer Key"
                labelPlacement="outside"
                value={wooConsumerKey}
                onValueChange={setWooConsumerKey}
                isDisabled={!canManage}
                placeholder="ck_…"
              />
              <Input
                label="Consumer Secret"
                labelPlacement="outside"
                type="password"
                value={wooConsumerSecret}
                onValueChange={setWooConsumerSecret}
                isDisabled={!canManage}
                placeholder={wooHasSecret ? 'cs_*** (збережено)' : 'cs_…'}
              />
              {wooTestError && (
                <p className="text-xs text-danger">{wooTestError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  data-btn-tone="primary-blue-solid"
                  isLoading={wooTesting}
                  isDisabled={!canManage}
                  onPress={() => void handleWooTest()}
                >
                  Тест підключення
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  isDisabled={!canManage || !wooCredentialsDirty}
                  onPress={() => setWooSaveConfirm(true)}
                >
                  Зберегти credentials
                </Button>
              </div>
              <Divider />
              <div className="flex items-end gap-2">
                <Input
                  className="flex-1 min-w-0"
                  label="Inspect SKU"
                  labelPlacement="outside"
                  value={inspectSku}
                  onValueChange={setInspectSku}
                  placeholder="SKU для тесту"
                  isDisabled={!canManage}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inspectSku.trim() && canManage) {
                      void handleInspect();
                    }
                  }}
                />
                <Button
                  variant="flat"
                  color="success"
                  className="shrink-0"
                  isDisabled={!canManage || !inspectSku.trim()}
                  onPress={() => void handleInspect()}
                  startContent={<DynamicIcon name={inspectLoading ? 'loader-2' : 'search-code'} className={inspectLoading ? 'animate-spin' : ''} size={14} />}
                >
                  Інспектувати
                </Button>
              </div>
              {inspectError != null && (
                <p className="text-sm text-danger">{inspectError}</p>
              )}
              {inspectData != null && (
                <div className="flex flex-col gap-2">
                  <Tabs
                    size="sm"
                    color="primary"
                    aria-label="Режим перегляду inspect"
                    selectedKey={inspectViewTab}
                    onSelectionChange={(key) => setInspectViewTab(String(key) as InspectViewTab)}
                  >
                    <Tab key="summary" title="Summary" />
                    <Tab key="raw" title="Raw" />
                  </Tabs>
                  <div
                    className="resize-y overflow-hidden min-h-40 h-52 max-h-[75vh] rounded-sm border border-gray-200 bg-gray-100 p-1"
                    title="Потягніть за нижній край, щоб змінити висоту"
                  >
                    <MetaLogJsonView
                      value={inspectViewTab === 'summary' ? inspectData.summary : inspectData.raw}
                      className="h-full min-h-0"
                    />
                  </div>
                </div>
              )}
              <Divider />
              <p className="text-sm font-medium text-gray-700">Orphan media cleanup</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  isLoading={orphanLoading}
                  isDisabled={!canManage}
                  onPress={() => void handleOrphanAudit()}
                >
                  Аудит orphan
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  variant="flat"
                  isDisabled={!canManage || orphanIds.length === 0}
                  onPress={() => setOrphanDeleteConfirm(true)}
                >
                  Видалити orphan ({orphanIds.length})
                </Button>
              </div>
              {orphanResult && <p className="text-xs text-default-500">{orphanResult}</p>}
            </CardBody>
          </Card>

          <Card className="w-full">
            <CardHeader className="border-b border-gray-200">
              <DynamicIcon name="key-round" size={18} className="text-gray-600 mr-2" />
              <h2 className="text-base font-semibold text-gray-900">Meta-ключі</h2>
            </CardHeader>
            <CardBody className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Реєстр meta-полів WooCommerce. Блоки конструктора посилаються на них за id.
              </p>

              <div className="space-y-3">
                {editMetaKeys.map((row) => {
                  const isDeleteConfirm = deleteMetaKeyConfirmId === row.id;
                  return (
                    <div
                      key={row.id}
                      className="rounded-lg border border-gray-200 bg-white p-3 space-y-2"
                    >
                      <div className="flex gap-2">
                        <Input
                          size="sm"
                          label="Назва"
                          labelPlacement="outside"
                          value={row.label}
                          onValueChange={(label) => updateMetaKey(row.id, { label })}
                          placeholder="Склад"
                        />
                        <Input
                          size="sm"
                          label="Meta-ключ WP"
                          labelPlacement="outside"
                          value={row.key}
                          onValueChange={(key) => updateMetaKey(row.id, { key })}
                          placeholder="_nk_ingredients"
                          classNames={{ input: 'font-mono text-sm' }}
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="light"
                          color="danger"
                          aria-label={
                            isDeleteConfirm ? 'Підтвердити видалення meta-ключа' : 'Видалити meta-ключ'
                          }
                          onPress={() => handleDeleteMetaKey(row.id)}
                          startContent={
                            <DynamicIcon name={isDeleteConfirm ? 'check' : 'trash-2'} size={14} />
                          }
                        >
                          {isDeleteConfirm ? 'Підтвердити видалення' : 'Видалити'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                size="md"
                variant="flat"
                className="w-full px-3.5"
                data-btn-tone="primary-blue-solid"
                onPress={handleAddMetaKey}
                startContent={<DynamicIcon name="plus" size={16} />}
              >
                Додати meta-ключ
              </Button>
            </CardBody>
          </Card>

          <Card className="w-full">
            <CardHeader className="border-b border-gray-200">
              <DynamicIcon name="layers" size={18} className="text-gray-600 mr-2" />
              <h2 className="text-base font-semibold text-gray-900">Категорії комплекту</h2>
            </CardHeader>
            <CardBody className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Мапінг батьківських папок компонентів у BOM. Використовується для групування в
                шаблоні <code className="text-xs bg-gray-200/75 p-1 rounded">kitComponents</code>.
                Дефолтна вага категорії — fallback, якщо в BOM немає ваги позиції; з неї
                формується <code className="text-xs bg-gray-200/75 p-1 rounded">groupWeightSuffix</code>.
              </p>

              <DragDropContext onDragEnd={handleKitCategoryDragEnd}>
                <Droppable droppableId="kit-component-categories">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                      {sortedKitCategories.map((row, index) => {
                        const isDeleteConfirm = deleteKitCategoryConfirmId === row.id;
                        return (
                          <Draggable key={row.id} draggableId={row.id} index={index}>
                            {(drag, snapshot) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                className={`rounded-lg border border-gray-200 bg-white p-3 space-y-2 ${
                                  snapshot.isDragging ? 'shadow-md ring-1 ring-primary-200' : ''
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <div
                                    {...drag.dragHandleProps}
                                    className="mt-7 flex items-center justify-center text-gray-300 cursor-grab active:cursor-grabbing hover:text-gray-500"
                                    title="Перетягніть для зміни порядку груп"
                                  >
                                    <DynamicIcon name="grip-vertical" size={16} />
                                  </div>
                                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <Select
                                      size="sm"
                                      label="Папка в каталозі"
                                      labelPlacement="outside"
                                      placeholder="Оберіть папку"
                                      selectedKeys={row.label ? [row.label] : []}
                                      onSelectionChange={(keys) => {
                                        const label = String(Array.from(keys)[0] ?? '').trim();
                                        if (!label) return;
                                        updateKitCategory(row.id, {
                                          label,
                                          genitive: label.toLowerCase(),
                                        });
                                      }}
                                    >
                                      {[
                                        ...(row.label &&
                                        !finishedProductFolders.some((folder) => folder.name === row.label)
                                          ? [{ id: row.label, name: row.label }]
                                          : []),
                                        ...finishedProductFolders.filter(
                                          (folder) =>
                                            folder.name === row.label ||
                                            !usedKitCategoryLabels.has(folder.name),
                                        ),
                                      ].map((folder) => (
                                        <SelectItem key={folder.name} textValue={folder.name}>
                                          {folder.name}
                                        </SelectItem>
                                      ))}
                                    </Select>
                                    <Input
                                      size="sm"
                                      label="Відмінок (для заголовка)"
                                      labelPlacement="outside"
                                      value={row.genitive}
                                      onValueChange={(genitive) =>
                                        updateKitCategory(row.id, { genitive })
                                      }
                                      placeholder="перших страв"
                                    />
                                    <Input
                                      size="sm"
                                      type="number"
                                      label="Вага від (кг)"
                                      labelPlacement="outside"
                                      description="Fallback для позицій без ваги в BOM"
                                      value={String(row.defaultWeightKg)}
                                      onValueChange={(value) => {
                                        const parsed = Number(value.replace(',', '.'));
                                        if (Number.isFinite(parsed) && parsed > 0) {
                                          const maxKg =
                                            row.defaultWeightMaxKg != null &&
                                            row.defaultWeightMaxKg <= parsed
                                              ? null
                                              : row.defaultWeightMaxKg;
                                          updateKitCategory(row.id, {
                                            defaultWeightKg: parsed,
                                            defaultWeightMaxKg: maxKg,
                                          });
                                        }
                                      }}
                                      placeholder="0.4"
                                    />
                                    <Input
                                      size="sm"
                                      type="number"
                                      label="Вага до (кг, опц.)"
                                      labelPlacement="outside"
                                      value={
                                        row.defaultWeightMaxKg != null
                                          ? String(row.defaultWeightMaxKg)
                                          : ''
                                      }
                                      onValueChange={(value) => {
                                        const trimmed = value.trim();
                                        if (!trimmed) {
                                          updateKitCategory(row.id, { defaultWeightMaxKg: null });
                                          return;
                                        }
                                        const parsed = Number(trimmed.replace(',', '.'));
                                        if (Number.isFinite(parsed) && parsed > row.defaultWeightKg) {
                                          updateKitCategory(row.id, { defaultWeightMaxKg: parsed });
                                        }
                                      }}
                                      placeholder="0.45"
                                      classNames={{ input: 'placeholder:opacity-50' }}
                                      description="Діапазон у заголовку, напр. 400-450г"
                                    />
                                  </div>
                                </div>
                                <div className="flex justify-end">
                                  <Button
                                    size="sm"
                                    variant="light"
                                    color="danger"
                                    aria-label={
                                      isDeleteConfirm
                                        ? 'Підтвердити видалення категорії'
                                        : 'Видалити категорію'
                                    }
                                    onPress={() => handleDeleteKitCategory(row.id)}
                                    startContent={
                                      <DynamicIcon
                                        name={isDeleteConfirm ? 'check' : 'trash-2'}
                                        size={14}
                                      />
                                    }
                                  >
                                    {isDeleteConfirm ? 'Підтвердити видалення' : 'Видалити'}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

              <Button
                size="md"
                variant="flat"
                className="w-full px-3.5"
                data-btn-tone="primary-blue-solid"
                onPress={handleAddKitCategory}
                startContent={<DynamicIcon name="plus" size={16} />}
              >
                Додати категорію
              </Button>

              <Divider />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <Input
                  size="sm"
                  label="Fallback відмінок"
                  labelPlacement="outside"
                  value={editKitSettings.fallbackGenitive}
                  onValueChange={(fallbackGenitive) =>
                    updateKitFallback({ fallbackGenitive })
                  }
                  placeholder="з інших категорій"
                />
                <Input
                  size="sm"
                  type="number"
                  label="Fallback вага від (кг)"
                  labelPlacement="outside"
                  value={String(editKitSettings.fallbackDefaultWeightKg)}
                  onValueChange={(value) => {
                    const parsed = Number(value.replace(',', '.'));
                    if (Number.isFinite(parsed) && parsed > 0) {
                      const maxKg =
                        editKitSettings.fallbackDefaultWeightMaxKg != null &&
                        editKitSettings.fallbackDefaultWeightMaxKg <= parsed
                          ? null
                          : editKitSettings.fallbackDefaultWeightMaxKg;
                      updateKitFallback({
                        fallbackDefaultWeightKg: parsed,
                        fallbackDefaultWeightMaxKg: maxKg,
                      });
                    }
                  }}
                  placeholder="0.3"
                />
                <Input
                  size="sm"
                  type="number"
                  label="Fallback вага до (кг)"
                  labelPlacement="outside"
                  value={
                    editKitSettings.fallbackDefaultWeightMaxKg != null
                      ? String(editKitSettings.fallbackDefaultWeightMaxKg)
                      : ''
                  }
                  onValueChange={(value) => {
                    const trimmed = value.trim();
                    if (!trimmed) {
                      updateKitFallback({ fallbackDefaultWeightMaxKg: null });
                      return;
                    }
                    const parsed = Number(trimmed.replace(',', '.'));
                    if (
                      Number.isFinite(parsed) &&
                      parsed > editKitSettings.fallbackDefaultWeightKg
                    ) {
                      updateKitFallback({ fallbackDefaultWeightMaxKg: parsed });
                    }
                  }}
                  placeholder="0.35"
                  classNames={{ input: 'placeholder:opacity-50' }}
                />
                <Input
                  size="sm"
                  type="number"
                  label="Fallback порядок"
                  labelPlacement="outside"
                  value={String(editKitSettings.fallbackOrder)}
                  onValueChange={(value) => {
                    const parsed = Number(value);
                    if (Number.isFinite(parsed)) {
                      updateKitFallback({ fallbackOrder: parsed });
                    }
                  }}
                  placeholder="100"
                />
              </div>
            </CardBody>
          </Card>
        </aside>

        <div className="lg:col-span-3">
          <Card className="w-full">
            <CardHeader className="border-b border-gray-200">
              <DynamicIcon name="layout-template" size={18} className="text-gray-600 mr-2" />
              <h2 className="text-base font-semibold text-gray-900">Конструктор повного опису товару</h2>
              <p className="text-sm text-gray-400 ml-1">– блоки опису та їх meta-привʼязки</p>
            </CardHeader>
            <CardBody className="p-6 space-y-5">
              <div className="flex flex-col lg:flex-row gap-2 lg:items-start">
                <div className="flex-1 min-w-0">
                  {isAddingPreset ? (
                    <Input
                      label="Назва нового preset"
                      labelPlacement="outside"
                      classNames={{ label: 'font-semibold' }}
                      placeholder="Назва"
                      value={newPresetName}
                      onValueChange={setNewPresetName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void createPreset();
                        if (e.key === 'Escape') cancelAddingPreset();
                      }}
                      autoFocus
                    />
                  ) : (
                    <Select
                      label="Preset"
                      labelPlacement="outside"
                      classNames={{ label: 'font-semibold' }}
                      selectedKeys={selectedPresetId ? [selectedPresetId] : []}
                      onSelectionChange={(keys) => {
                        const id = Array.from(keys)[0] as string;
                        if (id) handleSelectPreset(id);
                      }}
                      description="Default preset застосовується до нових товарів без індивідуального вибору"
                    >
                      {presets.map((p) => (
                        <SelectItem key={p.id} textValue={p.name}>
                          {p.name}
                          {p.id === pendingDefaultPresetId ? <span className="text-[10px] uppercase tracking-wide text-blue-500 bg-blue-500/10 border border-blue-500/20 px-1 py-0.5 ml-2 rounded">типовий</span> : ''}
                        </SelectItem>
                      ))}
                    </Select>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 pt-6">
                  {selectedPreset && !isAddingPreset && (
                    <>
                      <Button
                        size="md"
                        color="primary"
                        variant="flat"
                        className="px-3.5"
                        onPress={() => handleSetDefaultPreset(selectedPreset.id)}
                        isDisabled={isDefaultPending}
                      >
                        Зберегти як типовий
                      </Button>
                      <Button
                        size="md"
                        variant="flat"
                        color="danger"
                        aria-label={
                          deletePresetConfirm ? 'Підтвердити видалення preset' : 'Видалити preset'
                        }
                        isDisabled={selectedPreset.isDefault || saving}
                        className={CONFIRM_EXPAND_BUTTON_CLASS}
                        onPress={() => {
                          if (!deletePresetConfirm) {
                            setDeletePresetConfirm(true);
                            setAddPresetConfirm(false);
                            return;
                          }
                          setDeletePresetConfirm(false);
                          void deletePreset(selectedPreset.id);
                        }}
                      >
                        <DynamicIcon name="trash-2" size={16} className="shrink-0" />
                        <span
                          className={[
                            CONFIRM_EXPAND_LABEL_CLASS,
                            deletePresetConfirm
                              ? 'max-w-[4.5rem] opacity-100 ml-2'
                              : 'max-w-0 opacity-0 ml-0',
                          ].join(' ')}
                        >
                          Видалити?
                        </span>
                      </Button>
                      <Button
                        size="md"
                        className={[BTN_PRIMARY_BLUE, CONFIRM_EXPAND_BUTTON_CLASS].join(' ')}
                        aria-label={addPresetConfirm ? 'Підтвердити додавання preset' : 'Додати preset'}
                        onPress={() => {
                          if (!addPresetConfirm) {
                            setAddPresetConfirm(true);
                            setDeletePresetConfirm(false);
                            return;
                          }
                          setAddPresetConfirm(false);
                          startAddingPreset();
                        }}
                      >
                        <DynamicIcon name="plus" size={16} className="shrink-0" />
                        <span
                          className={[
                            CONFIRM_EXPAND_LABEL_CLASS,
                            addPresetConfirm
                              ? 'max-w-[4.5rem] opacity-100 ml-2'
                              : 'max-w-0 opacity-0 ml-0',
                          ].join(' ')}
                        >
                          Додати?
                        </span>
                      </Button>
                    </>
                  )}
                  {isAddingPreset && (
                    <>
                      <Button
                        size="md"
                        className={BTN_PRIMARY_BLUE}
                        onPress={() => void createPreset()}
                        isDisabled={!newPresetName.trim() || saving}
                        startContent={
                          <DynamicIcon
                            name={saving ? 'loader-circle' : 'check'}
                            size={14}
                            className={saving ? 'animate-spin shrink-0' : 'shrink-0'}
                          />
                        }
                      >
                        Створити
                      </Button>
                      <Button size="md" variant="light" onPress={cancelAddingPreset} isDisabled={saving}>
                        Скасувати
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Усі увімкнені блоки обʼєднуються в повний опис товару. Meta-ключ дублює значення в
                окреме WP meta-поле.
                <br />
                Плейсхолдери:{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{ingredients}}'}</code>,{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{proteins}}'}</code>,{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{fats}}'}</code>,{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{carbs}}'}</code>,{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{energy}}'}</code>,{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{nutrition}}'}</code>,{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{netWeight}}'}</code>,{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{grossWeight}}'}</code>,{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{kitComponents}}'}</code>
                {' '}або WC meta-ключ, напр.{' '}
                <code className="text-xs bg-gray-200/75 p-1 rounded">{'{{_nk_ingredients}}'}</code>.
              </p>

              {selectedPreset && (
                <>
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="storefront-blocks">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                          {editBlocks.map((block, index) => {
                            const usesTemplate = storefrontBlockUsesTemplate(block.resolver);
                            const sourceHint = STOREFRONT_RESOLVER_HINTS[block.resolver];
                            const primaryPlaceholder = getStorefrontResolverPrimaryPlaceholder(block.resolver);
                            const isDeleteConfirm = deleteBlockConfirmId === block.id;
                            const isProtectedBlock = isStorefrontProtectedBlockId(block.id);

                            return (
                              <Draggable key={block.id} draggableId={block.id} index={index}>
                                {(drag, snapshot) => (
                                  <div
                                    ref={drag.innerRef}
                                    {...drag.draggableProps}
                                    className={`rounded-lg border border-gray-200 bg-white ${
                                      snapshot.isDragging ? 'shadow-md ring-1 ring-primary-200' : ''
                                    } ${!block.enabled ? 'opacity-70' : ''}`}
                                  >
                                    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-100">
                                      <div
                                        {...drag.dragHandleProps}
                                        className="flex items-center justify-center text-gray-300 cursor-grab active:cursor-grabbing hover:text-gray-500"
                                        title="Перетягніть для зміни порядку"
                                      >
                                        <DynamicIcon name="grip-vertical" size={16} />
                                      </div>
                                      <Switch
                                        size="sm"
                                        isSelected={block.enabled}
                                        onValueChange={() => toggleBlock(block.id)}
                                        aria-label={block.label}
                                      />
                                      {editingBlockLabelId === block.id ? (
                                        <Input
                                          size="sm"
                                          variant="flat"
                                          className="max-w-3xs"
                                          value={block.label}
                                          onValueChange={(label) => updateBlock(block.id, { label })}
                                          aria-label="Назва блоку"
                                          placeholder="Назва блоку"
                                          autoFocus
                                          onBlur={() => setEditingBlockLabelId(null)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === 'Escape') {
                                              setEditingBlockLabelId(null);
                                            }
                                          }}
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          className="max-w-3xs truncate px-1 py-0.5 -mx-1 rounded text-sm font-medium text-gray-900 text-left cursor-text hover:bg-gray-100"
                                          onClick={() => setEditingBlockLabelId(block.id)}
                                          title="Натисніть для редагування"
                                        >
                                          {block.label.trim() || (
                                            <span className="font-normal text-gray-400">Назва блоку</span>
                                          )}
                                        </button>
                                      )}
                                      <Select
                                        size="sm"
                                        label="Meta-ключ"
                                        aria-label="Meta-ключ WooCommerce"
                                        labelPlacement="outside-left"
                                        selectedKeys={[block.metaKeyId ?? '']}
                                        onSelectionChange={(keys) => {
                                          const value = Array.from(keys)[0] as string;
                                          updateBlock(block.id, { metaKeyId: value || null });
                                        }}
                                        classNames={{
                                          base: 'max-w-60 ml-auto',
                                          mainWrapper: 'flex-1 min-w-0 max-w-full',
                                        }}
                                        popoverProps={{
                                          crossOffset: -110,
                                          classNames: {
                                            base: 'w-70',
                                            content: 'px-1!'
                                          }
                                        }}
                                      >
                                        {metaKeyOptions.map((option) => (
                                          <SelectItem key={option.id || 'none'} textValue={option.label}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </Select>
                                      {!isProtectedBlock ? (
                                        <Button
                                          size="sm"
                                          variant="light"
                                          color="danger"
                                          isIconOnly
                                          aria-label={
                                            isDeleteConfirm ? 'Підтвердити видалення блоку' : 'Видалити блок'
                                          }
                                          onPress={() => handleDeleteBlock(block.id)}
                                        >
                                          <DynamicIcon name={isDeleteConfirm ? 'check' : 'trash-2'} size={16} />
                                        </Button>
                                      ) : (
                                        <span
                                          className="inline-flex h-8 w-8 items-center justify-center text-gray-300"
                                          title="Блок привʼязаний до даних товару — вимкніть перемикачем, видалити не можна"
                                        >
                                          <DynamicIcon name="lock" size={14} />
                                        </span>
                                      )}
                                    </div>

                                    <div className="px-3 py-3 space-y-2">
                                      {usesTemplate && (
                                        <>
                                          <p className="text-xs font-semibold text-gray-700">Шаблон</p>
                                          {block.resolver === 'kitComponents' ? (
                                            <>
                                              <KitComponentsTemplateHelp />
                                              <KitComponentsTemplateEditor
                                                key={`${block.id}-${blocksRevision}`}
                                                value={block.template}
                                                onChange={(template) => updateBlock(block.id, { template })}
                                                isDisabled={!block.enabled || !canManage}
                                              />
                                            </>
                                          ) : (
                                            <>
                                              <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                  {primaryPlaceholder && (
                                                    <p className="text-xs text-gray-500">
                                                      {sourceHint}. Основний плейсхолдер:{' '}
                                                      <code className="bg-gray-100 px-1 rounded">
                                                        {primaryPlaceholder}
                                                      </code>
                                                    </p>
                                                  )}
                                                  {!primaryPlaceholder && (
                                                    <p className="text-xs text-gray-500">{sourceHint}</p>
                                                  )}
                                                </div>
                                                {hasStorefrontDefaultBlockTemplate(block) && (
                                                  <Button
                                                    size="sm"
                                                    variant="flat"
                                                    isDisabled={!block.enabled || !canManage}
                                                    onPress={() =>
                                                      updateBlock(block.id, {
                                                        template: getStorefrontDefaultBlockTemplate(block),
                                                      })
                                                    }
                                                    startContent={
                                                      <DynamicIcon name="rotate-ccw" size={14} />
                                                    }
                                                  >
                                                    Скинути до типового
                                                  </Button>
                                                )}
                                              </div>
                                              <DescriptionEditor
                                                key={`${block.id}-${blocksRevision}`}
                                                value={block.template}
                                                onChange={(template) => updateBlock(block.id, { template })}
                                                isDisabled={!block.enabled}
                                                minHeightClass={
                                                  block.resolver === 'heating' ? 'min-h-[120px]' : 'min-h-[72px]'
                                                }
                                              />
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>

                  <Button
                    size="md"
                    variant="flat"
                    className="px-3.5"
                    data-btn-tone="primary-blue-solid"
                    onPress={handleAddBlock}
                    startContent={<DynamicIcon name="plus" size={16} />}
                  >
                    Додати новий блок
                  </Button>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          {justSaved && (
            <Chip
              color="success"
              variant="flat"
              size="sm"
              startContent={<DynamicIcon name="check" size={12} />}
              className="pl-2 pr-1.5 border-1 border-success-500"
            >
              Збережено
            </Chip>
          )}
          {hasChanges && !justSaved && (
            <Chip
              color="warning"
              variant="flat"
              size="sm"
              startContent={<DynamicIcon name="triangle-alert" size={12} />}
              className="pl-2 pr-1.5 border-1 border-warning-500"
            >
              Є незбережені зміни
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            color="default"
            variant="light"
            size="md"
            isDisabled={!hasChanges || saving || !canManage}
            onPress={handleCancel}
          >
            Скасувати
          </Button>
          <Button
            color="primary"
            size="md"
            isDisabled={!hasChanges || saving || !canManage}
            onPress={handleSave}
            startContent={
              <DynamicIcon
                name={saving ? 'loader-circle' : 'save'}
                size={16}
                className={saving ? 'animate-spin' : undefined}
              />
            }
          >
            Зберегти налаштування
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={wooSaveConfirm}
        title="Зберегти WooCommerce credentials?"
        message="Нові ключі API будуть збережені на сервері. Secret не відображається після збереження."
        confirmText="Зберегти"
        confirmColor="primary"
        confirmLoading={wooSaving}
        onConfirm={() => void handleWooSave()}
        onCancel={() => setWooSaveConfirm(false)}
      />

      <ConfirmModal
        isOpen={orphanDeleteConfirm}
        title="Видалити orphan media?"
        message={`Буде видалено ${orphanIds.length} файлів з WordPress media library. Дію неможливо скасувати.`}
        confirmText="Видалити"
        confirmColor="danger"
        confirmLoading={orphanLoading}
        onConfirm={() => void handleOrphanDelete()}
        onCancel={() => setOrphanDeleteConfirm(false)}
      />
    </div>
  );
};

export default SettingsStorefront;
