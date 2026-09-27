import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Select,
  SelectItem,
  Switch,
  addToast,
} from '@heroui/react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import { storefrontApi } from '../services/StorefrontService';
import { DescriptionEditor } from './Products/components/DescriptionEditor';
import { BTN_PRIMARY_BLUE } from '@/lib/buttonStyles';
import type {
  StorefrontBlockConfig,
  StorefrontMetaKeyConfig,
  StorefrontPresetDto,
  StorefrontSettingsDto,
} from '@shared/types/storefront';
import {
  STOREFRONT_DEFAULT_BLOCKS,
  STOREFRONT_RESOLVER_HINTS,
  createCustomStorefrontBlock,
  createCustomStorefrontMetaKey,
  metaKeysEqual,
  normalizeStorefrontBlocks,
  normalizeStorefrontMetaKeys,
  storefrontBlockUsesTemplate,
  isStorefrontProtectedBlockId,
} from '@shared/constants/storefrontDefaults';
import { getStorefrontResolverPrimaryPlaceholder } from '@shared/utils/storefrontDescription';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';

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
  const [pendingDefaultPresetId, setPendingDefaultPresetId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [deletePresetConfirm, setDeletePresetConfirm] = useState(false);
  const [addPresetConfirm, setAddPresetConfirm] = useState(false);
  const [deleteBlockConfirmId, setDeleteBlockConfirmId] = useState<string | null>(null);
  const [deleteMetaKeyConfirmId, setDeleteMetaKeyConfirmId] = useState<string | null>(null);
  const [editingBlockLabelId, setEditingBlockLabelId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [presetRows, settingsRow] = await Promise.all([
        storefrontApi.listPresets(),
        storefrontApi.getSettings(),
      ]);
      setPresets(presetRows);
      setSavedSettings(settingsRow);
      setPendingDefaultPresetId(settingsRow.defaultPresetId);
      setEditMetaKeys([...settingsRow.metaKeys]);
      setSavedMetaKeys([...settingsRow.metaKeys]);

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
      pendingDefaultPresetId !== savedSettings.defaultPresetId
    );
  }, [editBlocks, savedBlocks, editMetaKeys, savedMetaKeys, savedSettings, pendingDefaultPresetId]);

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

  const handleSelectPreset = (id: string) => {
    setDeletePresetConfirm(false);
    setAddPresetConfirm(false);
    setDeleteBlockConfirmId(null);
    setIsAddingPreset(false);
    setNewPresetName('');
    setSelectedPresetId(id);
    const preset = presets.find((p) => p.id === id);
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
        blocks: normalizeStorefrontBlocks([...STOREFRONT_DEFAULT_BLOCKS], editMetaKeys),
      });
      setPresets((rows) => [...rows, created]);
      setIsAddingPreset(false);
      setNewPresetName('');
      handleSelectPreset(created.id);
      addToast({ title: 'Preset створено', color: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({ title: 'Помилка створення', description: message, color: 'danger' });
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
      addToast({ title: 'Preset видалено', color: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({ title: 'Помилка видалення', description: message, color: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!savedSettings) return;
    setEditBlocks([...savedBlocks]);
    setEditMetaKeys([...savedMetaKeys]);
    setPendingDefaultPresetId(savedSettings.defaultPresetId);
    setIsAddingPreset(false);
    setDeletePresetConfirm(false);
    setAddPresetConfirm(false);
    setDeleteBlockConfirmId(null);
    setDeleteMetaKeyConfirmId(null);
    setNewPresetName('');
    setJustSaved(false);
    void load();
  };

  const handleSave = async () => {
    if (!selectedPreset || !savedSettings) return;
    setSaving(true);
    setError(null);
    try {
      const normalizedMetaKeys = normalizeStorefrontMetaKeys(editMetaKeys);
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

      if (!blocksEqual(normalizedBlocks, savedBlocks)) {
        tasks.push(
          storefrontApi
            .updatePreset(selectedPreset.id, { blocks: normalizedBlocks })
            .then((updated) => {
              setPresets((rows) => rows.map((p) => (p.id === updated.id ? updated : p)));
              setEditBlocks(normalizedBlocks);
              setSavedBlocks(normalizedBlocks);
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
            <CardHeader className="border-b border-gray-200">
              <DynamicIcon name="plug" size={18} className="text-gray-600 mr-2" />
              <h2 className="text-base font-semibold text-gray-900">WooCommerce API</h2>
              <Chip size="sm" variant="flat" color="warning" className="ml-2">
                Phase 2
              </Chip>
            </CardHeader>
            <CardBody className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Підключення WooCommerce REST буде доступне у Phase 2. Поля нижче — заглушка інтерфейсу.
              </p>
              <Input label="URL магазину" labelPlacement="outside" isDisabled placeholder="https://nk-food.shop" />
              <Input label="Consumer Key" labelPlacement="outside" isDisabled placeholder="ck_…" />
              <Input
                label="Consumer Secret"
                labelPlacement="outside"
                isDisabled
                type="password"
                placeholder="cs_…"
              />
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
                          {p.id === pendingDefaultPresetId ? ' (дефолт)' : ''}
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
                        Зберегти дефолт
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
                                          {primaryPlaceholder && (
                                            <p className="text-xs text-gray-500">
                                              {sourceHint}. Основний плейсхолдер:{' '}
                                              <code className="bg-gray-100 px-1 rounded">{primaryPlaceholder}</code>
                                            </p>
                                          )}
                                          {!primaryPlaceholder && (
                                            <p className="text-xs text-gray-500">{sourceHint}</p>
                                          )}
                                          <DescriptionEditor
                                            value={block.template}
                                            onChange={(template) => updateBlock(block.id, { template })}
                                            isDisabled={!block.enabled}
                                            minHeightClass={
                                              block.resolver === 'heating' ? 'min-h-[120px]' : 'min-h-[72px]'
                                            }
                                          />
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
            <Chip color="success" variant="flat" size="sm" startContent={<DynamicIcon name="check" size={12} />}>
              Збережено
            </Chip>
          )}
          {hasChanges && !justSaved && (
            <Chip color="warning" variant="flat" size="sm" startContent={<DynamicIcon name="circle-dot" size={12} />}>
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
    </div>
  );
};

export default SettingsStorefront;
