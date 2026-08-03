import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState, useMemo } from 'react';
import type { IconName } from 'lucide-react/dynamic';
import {
  SPEC_COLOR_HUE_NAMES,
  getSpecColorByHue,
  specColorToClassNames,
  type SpecColorIntensity,
  type SpecColorTheme,
} from '@shared/utils/specColorPalette';

interface DirectoryRecord {
  id: string;
  name: string;
  owner?: string;
  [key: string]: any;
}

export interface DirectoryColorPickerConfig {
  /** id → hue name (закріплені) */
  colorMap: Record<string, string>;
  onChange: (id: string, hue: string | null) => void;
  /** Чи йде збереження */
  saving?: boolean;
  previewTheme?: SpecColorTheme;
  previewIntensity?: SpecColorIntensity;
}

interface DirectoryModalProps {
  isOpen: boolean;
  title: string;
  icon: IconName;
  records: DirectoryRecord[];
  columns: Array<{ key: string; label: string; sortable?: boolean }>;
  onClose: () => void;
  /** Якщо передано — модалка підтримує режим редагування */
  onSave?: (records: DirectoryRecord[]) => Promise<void>;
  /** Колонка вибору/закріплення кольору (accPolicies тощо) */
  colorPicker?: DirectoryColorPickerConfig;
}

export function DirectoryModal({
  isOpen,
  title,
  icon,
  records,
  columns,
  onClose,
  onSave,
  colorPicker,
}: DirectoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedRecords, setEditedRecords] = useState<DirectoryRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;

    const query = searchQuery.toLowerCase();
    return records.filter(
      (record) =>
        record.name?.toLowerCase?.().includes(query) ||
        record.id?.toLowerCase?.().includes(query) ||
        (record.owner && record.owner.toLowerCase().includes(query)) ||
        (record.code != null && String(record.code).toLowerCase().includes(query))
    );
  }, [records, searchQuery]);

  const autoColorById = useMemo(() => {
    if (!colorPicker) return {} as Record<string, string>;
    // Авто-призначення за порядком у відфільтрованому/повному списку (як у buildSpecColorMap — за code)
    const sorted = [...records].sort((a, b) => {
      const ac = a.code != null && String(a.code).trim() !== '' ? String(a.code) : null;
      const bc = b.code != null && String(b.code).trim() !== '' ? String(b.code) : null;
      if (ac != null && bc != null) {
        const an = Number(ac);
        const bn = Number(bc);
        if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
        return ac.localeCompare(bc, 'uk');
      }
      if (ac != null) return -1;
      if (bc != null) return 1;
      return String(a.name || a.id).localeCompare(String(b.name || b.id), 'uk');
    });
    const map: Record<string, string> = {};
    sorted.forEach((r, i) => {
      map[r.id] = SPEC_COLOR_HUE_NAMES[i % SPEC_COLOR_HUE_NAMES.length];
    });
    return map;
  }, [colorPicker, records]);

  const enterEditMode = () => {
    setEditedRecords(records.map((r) => ({ ...r })));
    setIsEditMode(true);
  };

  const cancelEdit = () => {
    setIsEditMode(false);
    setEditedRecords([]);
  };

  const handleFieldChange = (index: number, key: string, value: string) => {
    setEditedRecords((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  };

  const handleDeleteRow = (index: number) => {
    setEditedRecords((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddRow = () => {
    const newRecord: DirectoryRecord = { id: '', name: '' };
    columns.forEach((col) => {
      if (!(col.key in newRecord)) newRecord[col.key] = '';
    });
    setEditedRecords((prev) => [...prev, newRecord]);
  };

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(editedRecords);
      setIsEditMode(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isEditMode) cancelEdit();
    onClose();
  };

  const renderColorCell = (record: DirectoryRecord) => {
    if (!colorPicker || !record.id) return null;

    const pinnedHue = colorPicker.colorMap[record.id];
    const effectiveHue = pinnedHue || autoColorById[record.id] || SPEC_COLOR_HUE_NAMES[0];
    const tokens = getSpecColorByHue(
      effectiveHue,
      colorPicker.previewTheme ?? 'light',
      colorPicker.previewIntensity ?? 'soft'
    );
    const previewClass = specColorToClassNames(tokens, { border: true });
    const isPinned = Boolean(pinnedHue);

    return (
      <div className="flex items-center gap-2 min-w-[220px]">
        <Chip size="sm" variant="flat" classNames={{ base: previewClass, content: 'font-medium' }}>
          {record.name || effectiveHue}
        </Chip>
        <Select
          size="sm"
          aria-label={`Колір для ${record.name || record.id}`}
          className="min-w-[140px] max-w-[160px]"
          selectedKeys={[effectiveHue]}
          isDisabled={colorPicker.saving}
          onSelectionChange={(keys) => {
            const key = Array.from(keys as Set<string>)[0];
            if (!key) return;
            // Закріплюємо обраний hue (навіть якщо збігається з авто)
            colorPicker.onChange(record.id, key);
          }}
          renderValue={() => (
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block w-3 h-3 rounded-sm border ${getSpecColorByHue(effectiveHue).bg} ${getSpecColorByHue(effectiveHue).border}`}
              />
              <span className="text-xs">{effectiveHue}</span>
              {isPinned && <DynamicIcon name="pin" className="w-3 h-3 text-primary" />}
            </div>
          )}
        >
          {SPEC_COLOR_HUE_NAMES.map((hue) => {
            const hTokens = getSpecColorByHue(hue, 'light', 'soft');
            return (
              <SelectItem key={hue} textValue={hue}>
                <div className="flex items-center gap-2">
                  <Chip
                    size="sm"
                    variant="flat"
                    classNames={{
                      base: specColorToClassNames(hTokens, { border: true }),
                      content: 'text-[10px] font-medium',
                    }}
                  >
                    {hue}
                  </Chip>
                </div>
              </SelectItem>
            );
          })}
        </Select>
        {isPinned ? (
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="warning"
            aria-label="Зняти закріплення"
            isDisabled={colorPicker.saving}
            onPress={() => colorPicker.onChange(record.id, null)}
          >
            <DynamicIcon name="pin-off" className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label="Закріпити поточний колір"
            isDisabled={colorPicker.saving}
            onPress={() => colorPicker.onChange(record.id, effectiveHue)}
          >
            <DynamicIcon name="pin" className="w-3.5 h-3.5 text-default-400" />
          </Button>
        )}
      </div>
    );
  };

  const viewColumns = colorPicker
    ? [...columns, { key: '_color', label: 'Колір' }]
    : columns;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="5xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold border-b">
          <DynamicIcon name={icon} className="w-5 h-5 text-primary" />
          {title}
          <Chip size="sm" variant="solid" color="primary" className="ml-2">
            {isEditMode ? editedRecords.length : records.length} записів
          </Chip>
          {isEditMode && (
            <Chip size="sm" variant="flat" color="warning" className="ml-1">
              Режим редагування
            </Chip>
          )}
          {colorPicker && (
            <Chip size="sm" variant="flat" color="secondary" className="ml-1">
              Кольори типів
            </Chip>
          )}
        </ModalHeader>
        <ModalBody className="py-4">
          {!isEditMode && (
            <div className="mb-4">
              <Input
                placeholder="Пошук за назвою, ID або власником..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                startContent={<DynamicIcon name="search" className="w-4 h-4 text-default-400" />}
                isClearable
                onClear={() => setSearchQuery('')}
              />
            </div>
          )}

          {isEditMode ? (
            <div className="space-y-3">
              <Table
                aria-label={`Редагування: ${title}`}
                removeWrapper
                classNames={{ base: 'max-h-[440px] overflow-y-auto' }}
              >
                <TableHeader>
                  {[
                    ...columns.map((col) => <TableColumn key={col.key}>{col.label}</TableColumn>),
                    <TableColumn key="_actions" className="w-12">
                      {' '}
                    </TableColumn>,
                  ]}
                </TableHeader>
                <TableBody>
                  {editedRecords.map((record, index) => (
                    <TableRow key={index}>
                      {[
                        ...columns.map((col) => (
                          <TableCell key={col.key}>
                            <Input
                              size="sm"
                              variant="bordered"
                              value={String(record[col.key] ?? '')}
                              onChange={(e) => handleFieldChange(index, col.key, e.target.value)}
                              placeholder={col.label}
                              classNames={{ input: 'text-xs' }}
                            />
                          </TableCell>
                        )),
                        <TableCell key="_actions">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            color="danger"
                            onPress={() => handleDeleteRow(index)}
                            aria-label="Видалити рядок"
                          >
                            <DynamicIcon name="trash-2" className="w-4 h-4" />
                          </Button>
                        </TableCell>,
                      ]}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button
                size="sm"
                variant="bordered"
                color="primary"
                startContent={<DynamicIcon name="plus" className="w-4 h-4" />}
                onPress={handleAddRow}
              >
                Додати рядок
              </Button>
            </div>
          ) : (
            <>
              {filteredRecords.length > 0 ? (
                <Table
                  aria-label={title}
                  removeWrapper
                  classNames={{
                    base: 'max-h-[500px] overflow-y-auto',
                  }}
                >
                  <TableHeader>
                    {viewColumns.map((col) => (
                      <TableColumn key={col.key}>{col.label}</TableColumn>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record, index) => (
                      <TableRow key={record.id || index}>
                        {viewColumns.map((col) => (
                          <TableCell key={col.key}>
                            {col.key === '_color' ? (
                              renderColorCell(record)
                            ) : col.key === 'id' ? (
                              <code className="text-xs bg-default-100 px-2 py-1 rounded">
                                {record[col.key]}
                              </code>
                            ) : col.key === 'owner' && record.owner ? (
                              <code className="text-xs bg-default-100 px-2 py-1 rounded">
                                {record.owner}
                              </code>
                            ) : (
                              record[col.key] || '—'
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-default-500">
                  <DynamicIcon name="inbox" className="w-12 h-12 mb-2" />
                  <p>Записів не знайдено</p>
                </div>
              )}

              {searchQuery && (
                <div className="mt-3 text-sm text-default-500">
                  Знайдено: {filteredRecords.length} з {records.length}
                </div>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter className="border-t">
          {isEditMode ? (
            <>
              <Button variant="flat" onPress={cancelEdit} isDisabled={isSaving}>
                Скасувати
              </Button>
              <Button
                color="primary"
                onPress={handleSave}
                isLoading={isSaving}
                startContent={!isSaving && <DynamicIcon name="save" className="w-4 h-4" />}
              >
                Зберегти
              </Button>
            </>
          ) : (
            <>
              {onSave && (
                <Button
                  variant="bordered"
                  color="warning"
                  startContent={<DynamicIcon name="pencil" className="w-4 h-4" />}
                  onPress={enterEditMode}
                  className="mr-auto"
                >
                  Редагувати
                </Button>
              )}
              <Button variant="flat" onPress={onClose}>
                Закрити
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
