import { useState, useRef, useEffect } from 'react';
import { Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Button } from '@heroui/react';
import type { SortDescriptor } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate, pluralize } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import type { GoodMovingDocument, GoodMovingItem } from '@shared/types/movement';

// ---------------------------------------------------------------------------
// MovementHistoryTable — список переміщень як акордеон з плавною анімацією
// ---------------------------------------------------------------------------

interface MovementHistoryTableProps {
  documents: GoodMovingDocument[];
  onLoadDetails?: (docId: string) => Promise<void>;
  onRefreshDetails?: (docId: string) => Promise<void>;
  detailsLoading?: Record<string, boolean>;
  onEditMovement?: (doc: GoodMovingDocument) => Promise<void> | void;
}

export const MovementHistoryTable = ({
  documents,
  onLoadDetails,
  onRefreshDetails,
  detailsLoading = {},
  onEditMovement
}: MovementHistoryTableProps) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Окремий стан для індикатора завантаження кнопки "Редагувати накладну"
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  // Сортування таблиці товарів
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({ column: 'good', direction: 'ascending' });

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="inbox" className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p>Немає документів переміщень</p>
      </div>
    );
  }

  // Вимірюємо висоту контенту коли розгортаємо
  useEffect(() => {
    if (expandedDocId && contentRefs.current[expandedDocId]) {
      const height = contentRefs.current[expandedDocId]?.scrollHeight || 0;
      setContentHeights((prev) => ({
        ...prev,
        [expandedDocId]: height
      }));
    }
  }, [expandedDocId, documents]);

  // Завантажуємо деталі при розгортанні акордеона
  useEffect(() => {
    const doc = documents.find((d) => d.id === expandedDocId);
    if (expandedDocId && doc && !doc.details && onLoadDetails) {
      onLoadDetails(expandedDocId);
    }
  }, [expandedDocId, documents, onLoadDetails]);

  // Отримуємо список товарів з деталей
  const getGoodsFromDetails = (docId: string): GoodMovingItem[] => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc?.details?.tableParts?.tpGoods) {
      return [];
    }
    return Object.values(doc.details.tableParts.tpGoods);
  };

  // Сортуємо товари за поточним sortDescriptor
  const getSortedGoods = (docId: string): GoodMovingItem[] => {
    const items = getGoodsFromDetails(docId);
    const { column, direction } = sortDescriptor;
    const dir = direction === 'ascending' ? 1 : -1;
    return [...items].sort((a, b) => {
      if (column === 'good')  return (a.good__pr ?? '').localeCompare(b.good__pr ?? '', 'uk') * dir;
      if (column === 'sku')   return (a.sku ?? '').localeCompare(b.sku ?? '', 'uk') * dir;
      if (column === 'batch') return (a.goodPart__pr ?? '').localeCompare(b.goodPart__pr ?? '', 'uk') * dir;
      if (column === 'qty')   return (parseFloat(a.qty) - parseFloat(b.qty)) * dir;
      return 0;
    });
  };

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div key={doc.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {/* Заголовок акордеона */}
          <button
            className="w-full px-4 py-3 flex items-center justify-between bg-neutral-100 transition-colors"
            onClick={() => setExpandedDocId(expandedDocId === doc.id ? null : doc.id)}
          >
            <div className="grid grid-cols-[36px_200px_200px_200px_180px_1fr] items-center flex-1 min-w-0">
              <DynamicIcon
                name="chevron-right"
                className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${expandedDocId === doc.id ? 'rotate-90' : ''}`}
              />

              {/* Номер документа */}
              <div className="flex flex-col items-start min-w-0">
                <p className="text-sm font-medium text-gray-900">Переміщення <span className="tabular-nums">{doc.number}</span></p>
                <p className="text-xs text-gray-400 text-left">{formatDate(doc.date)}</p>
              </div>

              {/* Автор */}
              <div className="flex flex-col items-start min-w-0 px-4">
                <p className="text-sm text-gray-900 truncate max-w-full" title={doc.author__pr || doc.author}>{doc.author__pr || doc.author}</p>
                <p className="text-xs text-gray-400 tracking-wide">Автор</p>
              </div>

              {/* Компанія / ФОП */}
              <div className="flex flex-col items-start min-w-0 px-4">
                <p className="text-sm text-gray-900 truncate max-w-full" title={doc.firm__pr || doc.firm}>{doc.firm__pr || doc.firm}</p>
                <p className="text-xs text-gray-400">Компанія</p>
              </div>

              {/* Товари */}
              <div className="flex flex-col items-start min-w-0 px-4">
                <p className="text-sm text-gray-900 max-w-full" title={doc.details ? `${getGoodsFromDetails(doc.id).length} товарів` : 'Завантажити деталі для перегляду товарів'}>
                  {doc.details ? <span className="font-mono">{getGoodsFromDetails(doc.id).length}</span> : <span className="text-neutral-300">Завантажити...</span>}
                </p>
                <p className="text-xs text-gray-400">{pluralize(getGoodsFromDetails(doc.id).length, 'Товар', 'Товари', 'Товарів', 'Товари')}</p>
              </div>

              {/* Порції */}
              <div className="flex flex-col items-start min-w-0 px-4">
                <p className="text-sm text-gray-900 max-w-full" title={doc.details ? `${getGoodsFromDetails(doc.id).reduce((sum, item) => sum + parseFloat(item.qty), 0)} порцій` : 'Завантажити деталі для перегляду кількості порцій'}>
                  {doc.details ? <span className="font-mono">{getGoodsFromDetails(doc.id).reduce((sum, item) => sum + parseFloat(item.qty), 0)}</span> : <span className="text-neutral-300">Завантажити...</span>}
                </p>
                <p className="text-xs text-gray-400">{pluralize(getGoodsFromDetails(doc.id).reduce((sum, item) => sum + parseFloat(item.qty), 0), 'Порція', 'Порції', 'Порцій', 'Порції')}</p>
              </div>

            </div>
          </button>

          {/* Вміст акордеона — деталі документа */}
          <div
            style={{
              maxHeight: expandedDocId === doc.id ? `${contentHeights[doc.id] || 0}px` : '0',
              opacity: expandedDocId === doc.id ? 1 : 0,
              overflow: 'hidden',
              transition: 'all 300ms ease-in-out'
            }}
            className="bg-gray-50 border-t border-gray-200"
          >
            <div
              ref={(el) => {
                if (el) contentRefs.current[doc.id] = el;
              }}
              className="p-4"
            >
              {/* Деталі документа */}
              <div className="space-y-3 text-sm">                
                {/* Товари з переміщення */}
                {detailsLoading[doc.id] ? (
                  <div className="flex items-center justify-center py-4">
                    <Spinner size="sm" />
                    <span className="ml-2 text-sm text-gray-500">Завантаження товарів...</span>
                  </div>
                ) : doc.details ? (
                  <>
                    <div className="flex items-end justify-between mb-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide pl-2">
                        Товари ({getGoodsFromDetails(doc.id).length})
                      </p>
                      <div className="flex items-center gap-2 ml-auto">
                        {/* Кнопка оновлення деталей — доступна всім */}
                        {onRefreshDetails && (
                          <Button
                            variant="light"
                            size="sm"
                            onPress={() => onRefreshDetails(doc.id)}
                            isLoading={detailsLoading[doc.id]}
                            title="Оновити деталі з Діловода"
                            className="text-gray-500 bg-gray-100 hover:bg-gray-200!"
                            startContent={!detailsLoading[doc.id] ? <DynamicIcon name="refresh-cw" className="w-3.5 h-3.5" /> : undefined}
                          >
                            Оновити деталі
                          </Button>
                        )}
                        {/* Кнопка редагування (тільки для адміна) */}
                        {isAdmin && (
                          <Button
                            variant="light"
                            size="sm"
                            onPress={async () => {
                              if (!onEditMovement) return;
                              setEditingDocId(doc.id);
                              try {
                                await onEditMovement(doc);
                              } finally {
                                setEditingDocId(null);
                              }
                            }}
                            isLoading={editingDocId === doc.id}
                            title="Редагувати документ"
                            className="text-blue-500 bg-blue-100 hover:bg-blue-200!"
                            startContent={editingDocId !== doc.id ? <DynamicIcon name="edit-3" className="w-3.5 h-3.5" /> : undefined}
                          >
                            Редагувати накладну
                          </Button>
                        )}
                      </div>
                    </div>
                    <Table 
                      aria-label="Товари переміщення"
                      sortDescriptor={sortDescriptor}
                      onSortChange={setSortDescriptor}
                      classNames={{
                        base: "max-w-full",
                        table: "text-xs",
                        th: "first:rounded-s-md last:rounded-e-md bg-gray-200/50 text-gray-700 font-semibold py-1.5",
                        td: "py-1.5"
                      }}
                      removeWrapper={true}
                    >
                      <TableHeader>
                        <TableColumn key="good" allowsSorting className="text-left w-xl">Товар</TableColumn>
                        <TableColumn key="sku" allowsSorting className="text-left">Артикул</TableColumn>
                        <TableColumn key="batch" allowsSorting className="text-left">Партія</TableColumn>
                        <TableColumn key="qty" allowsSorting className="text-left">Кіл-ть порцій</TableColumn>
                        {/* <TableColumn key="cost" className="text-right">Вартість (грн)</TableColumn> */}
                      </TableHeader>
                      <TableBody items={getSortedGoods(doc.id)}>
                        {(item) => (
                          <TableRow key={item.id} className="hover:bg-gray-100 transition-colors">
                            <TableCell aria-description="Назва товару" className="text-left text-gray-900">{item.good__pr}</TableCell>
                            <TableCell aria-description="Артикул товару" className="text-left text-gray-600 font-mono">
                              {item.sku || <span className="text-gray-300 font-sans">—</span>}
                            </TableCell>
                            <TableCell aria-description="Партія товару" className="text-left text-gray-900"><span className="block max-w-[150px] truncate">{item.goodPart__pr}</span></TableCell>
                            <TableCell aria-description="Кількість порцій" className="text-left text-gray-800 font-medium">
                              {parseFloat(item.qty).toFixed(0)}
                            </TableCell>
                            {/* <TableCell aria-description="Вартість товару" className="text-right text-gray-800 font-semibold">
                              {parseFloat(item.amountCost).toFixed(2)}
                            </TableCell> */}
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </>
                ) : null}

                <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                  {doc.remark && (
                    <div className="text-gray-400">
                      <DynamicIcon name="info" className="w-4 h-4 mr-1.5 mb-0.5 inline-flex" />
                      <span className="mr-1">Примітка:</span>
                      <span className="">{doc.remark}</span>
                    </div>
                  )}
                  {/* ID (для отримання документа з Діловода) */}
                  <p className="text-xs text-gray-400 font-mono truncate ml-auto" title={doc.id}>
                    ID: {doc.id}
                  </p>
                </div>
                
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

