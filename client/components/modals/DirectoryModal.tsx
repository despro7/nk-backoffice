import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip, Input } from "@heroui/react";
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState, useMemo } from "react";
import type { IconName } from 'lucide-react/dynamic';

interface DirectoryRecord {
  id: string;
  name: string;
  owner?: string;
  [key: string]: any;
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
}

export function DirectoryModal({
  isOpen,
  title,
  icon,
  records,
  columns,
  onClose,
  onSave,
}: DirectoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedRecords, setEditedRecords] = useState<DirectoryRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Фільтрація записів (тільки в режимі перегляду)
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    
    const query = searchQuery.toLowerCase();
    return records.filter(record => 
      record.name.toLowerCase().includes(query) ||
      record.id.toLowerCase().includes(query) ||
      (record.owner && record.owner.toLowerCase().includes(query))
    );
  }, [records, searchQuery]);

  const enterEditMode = () => {
    setEditedRecords(records.map(r => ({ ...r })));
    setIsEditMode(true);
  };

  const cancelEdit = () => {
    setIsEditMode(false);
    setEditedRecords([]);
  };

  const handleFieldChange = (index: number, key: string, value: string) => {
    setEditedRecords(prev => prev.map((r, i) => i === index ? { ...r, [key]: value } : r));
  };

  const handleDeleteRow = (index: number) => {
    setEditedRecords(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddRow = () => {
    const newRecord: DirectoryRecord = { id: '', name: '' };
    columns.forEach(col => { if (!(col.key in newRecord)) newRecord[col.key] = ''; });
    setEditedRecords(prev => [...prev, newRecord]);
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

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose}
      size="5xl"
      scrollBehavior="inside"
    >
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
        </ModalHeader>
        <ModalBody className="py-4">
          {/* Пошук — тільки в режимі перегляду */}
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

          {/* Режим редагування */}
          {isEditMode ? (
            <div className="space-y-3">
              <Table
                aria-label={`Редагування: ${title}`}
                removeWrapper
                classNames={{ base: "max-h-[440px] overflow-y-auto" }}
              >
                <TableHeader>
                  {[...columns.map(col => (
                    <TableColumn key={col.key}>{col.label}</TableColumn>
                  )), <TableColumn key="_actions" className="w-12"> </TableColumn>]}
                </TableHeader>
                <TableBody>
                  {editedRecords.map((record, index) => (
                    <TableRow key={index}>
                      {[...columns.map(col => (
                        <TableCell key={col.key}>
                          <Input
                            size="sm"
                            variant="bordered"
                            value={String(record[col.key] ?? '')}
                            onChange={(e) => handleFieldChange(index, col.key, e.target.value)}
                            placeholder={col.label}
                            classNames={{ input: "text-xs" }}
                          />
                        </TableCell>
                      )), (
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
                        </TableCell>
                      )]}
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
            /* Режим перегляду */
            <>
              {filteredRecords.length > 0 ? (
                <Table 
                  aria-label={title}
                  removeWrapper
                  classNames={{
                    base: "max-h-[500px] overflow-y-auto",
                  }}
                >
                  <TableHeader>
                    {columns.map((col) => (
                      <TableColumn key={col.key}>{col.label}</TableColumn>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record, index) => (
                      <TableRow key={record.id || index}>
                        {columns.map((col) => (
                          <TableCell key={col.key}>
                            {col.key === 'id' ? (
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

              {/* Інфо про результати пошуку */}
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
