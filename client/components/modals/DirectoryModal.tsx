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
}

export function DirectoryModal({
  isOpen,
  title,
  icon,
  records,
  columns,
  onClose,
}: DirectoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Фільтрація записів
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    
    const query = searchQuery.toLowerCase();
    return records.filter(record => 
      record.name.toLowerCase().includes(query) ||
      record.id.toLowerCase().includes(query) ||
      (record.owner && record.owner.toLowerCase().includes(query))
    );
  }, [records, searchQuery]);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="5xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold border-b">
          <DynamicIcon name={icon} className="w-5 h-5 text-primary" />
          {title}
          <Chip size="sm" variant="flat" color="primary" className="ml-2">
            {records.length} записів
          </Chip>
        </ModalHeader>
        <ModalBody className="py-4">
          {/* Пошук */}
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

          {/* Таблиця */}
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
        </ModalBody>
        <ModalFooter className="border-t">
          <Button variant="flat" onPress={onClose}>
            Закрити
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
