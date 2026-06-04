import { useEffect, useRef, useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import { formatDate, formatRelativeDate, truncateText } from '@/lib';
import getFirmDisplayName from '@shared/utils/firmUtils';

interface HistoryAccordionTableProps {
  records: any[];
  emptyMessage?: string;
  showDelete?: boolean;
  showEdit?: boolean;
  isAdmin?: boolean;
  onRefresh?: () => void;
  onLoadRecord?: (record: any) => Promise<void>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
  onEditRecord?: (record: any) => Promise<void>;
  recordType?: 'inventory' | 'return' | 'writeOff' | 'releaseSet';
}

export const HistoryAccordionTable = ({
  records,
  emptyMessage = 'Немає записів',
  showDelete = true,
  showEdit = false,
  // onRefresh,
  // onLoadRecord,
  onDeleteRecord,
  onEditRecord,
  recordType,
}: HistoryAccordionTableProps) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [loadingLoadId, setLoadingLoadId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Utility to safely parse items (may be string, double-encoded, or array)
  const safeParseItems = (raw: any) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    let v = raw;
    try {
      while (typeof v === 'string') v = JSON.parse(v);
    } catch (e) {
      return [];
    }
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return [v];
    return [];
  };

  

  useEffect(() => {
    if (expandedRecordId && contentRefs.current[expandedRecordId]) {
      const h = contentRefs.current[expandedRecordId]?.scrollHeight || 0;
      setContentHeights((p) => ({ ...p, [expandedRecordId]: h }));
    }
  }, [expandedRecordId]);

  // const handleLoadRecord = async (recordId: string) => {
  //   if (!onLoadRecord) return;
  //   setLoadingLoadId(recordId);
  //   try {
  //     await onLoadRecord(records.find((r) => String(r.id) === String(recordId))!);
  //   } catch (error) {
  //     // swallow; parent handles errors
  //     // eslint-disable-next-line no-console
  //     console.error('[HistoryAccordionTable] Error loading record:', error);
  //   } finally {
  //     setLoadingLoadId(null);
  //   }
  // };

  const handleEditRecord = async (recordId: string) => {
    if (!onEditRecord) return;
    setLoadingEditId(recordId);
    try {
      await onEditRecord(records.find((r) => String(r.id) === String(recordId))!);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[HistoryAccordionTable] Error editing record:', error);
    } finally {
      setLoadingEditId(null);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!onDeleteRecord) return;
    setConfirmDeleteId(recordId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId || !onDeleteRecord) return;
    setLoadingDeleteId(confirmDeleteId);
    try {
      await onDeleteRecord(confirmDeleteId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[HistoryAccordionTable] Error deleting record:', error);
    } finally {
      setLoadingDeleteId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleCancelDelete = () => setConfirmDeleteId(null);

  if (!records || records.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">{emptyMessage}</div>
    );
  }

	// константа мапи типів
	const RECORD_TYPE_CONFIG: Record<string, { label: string; genitive?: string; dateField?: string; storageOperation?: string }> = {
		writeOff: 	{ label: 'Списання', dateField: 'writeOffDate' },
		releaseSet: { label: 'Випуск', genitive: 'випуску' },
	};

	// утиліта для отримання конфігурації по типу запису, з дефолтами
	function getRecordTypeConfig(type?: string) {
		if (!type) return { label: 'Запис', genitive: 'операції', dateField: 'createdAt' };
		return RECORD_TYPE_CONFIG[type] || { label: type, genitive: type, dateField: 'createdAt' };
	}

  return (
    <div className="space-y-2">
      {records.map((record) => {
				const cfg = getRecordTypeConfig(recordType); // recordType передається в компонент, напр. 'writeOff'
				const recordName = `${cfg.label} №${record.id}`;
				// Safely parse `record.items` which may be already an array, a JSON string,
				// or a double-encoded JSON string stored in DB.
				const safeParseItems = (raw: any) => {
					if (!raw) return [];
					if (Array.isArray(raw)) return raw;
					let v = raw;
					try {
						// If it's a string, try parsing repeatedly until we get a non-string
						while (typeof v === 'string') {
							v = JSON.parse(v);
						}
					} catch (e) {
						// fallback: return empty
						return [];
					}
					if (Array.isArray(v)) return v;
					// If it's an object representing a single set, wrap into array
					if (v && typeof v === 'object') return [v];
					return [];
				};

				const items = safeParseItems(record.items);
        const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 0), 0);
        const isExpanded = expandedRecordId === String(record.id);
				const reason = record.reason || record.writeOffReason || record.write_off_reason; // TODO: змінити типи після впровадження компоненту

        return (
          <div key={record.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center justify-between bg-neutral-100 transition-colors"
              onClick={() => setExpandedRecordId(isExpanded ? null : String(record.id))}
            >
              <div className="flex items-center gap-2 flex-1 text-left">
                <DynamicIcon
                  name="chevron-right"
                  className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                />
								<div className="flex items-center gap-4">
									<div className="flex flex-col">
										<span className="text-sm font-medium text-gray-700 tabular-nums">{recordName}</span>
										<span className="text-xs text-gray-400">{formatRelativeDate(record[cfg.dateField || 'createdAt'], { maxRelativeDays: 1 })}</span>
									</div>
									<div className="flex gap-2">
										{reason && (
											<Chip size="sm" color="default" variant="flat" className="bg-gray-200 text-gray-700">{reason}</Chip>
										)}
										{record.comment && (
											<Chip size="sm" color="warning" variant="flat" className="text-sm text-amber-700 ml-0.5 text-[13px]" startContent={<DynamicIcon name="message-circle-more" className="w-3 h-3 ml-1 mr-0.5" />}>{truncateText(record.comment, 25)}</Chip>
										)}
									</div>
								</div>
              </div>

              <div className="flex items-center gap-4">
                <div className="grid grid-cols-2 gap-12 ml-2 text-xs text-gray-500">
                  <div className="text-right">
                    <span className="text-medium font-semibold leading-none">{items.length}</span>
                    <p className="leading-none">позицій</p>
                  </div>
                  <div className="text-right">
                    <span className="text-medium font-semibold leading-none">{totalQuantity}</span>
                    <p className="leading-none">кількість</p>
                  </div>
                </div>
              </div>
            </button>

            <div
              style={{
                maxHeight: isExpanded ? `${contentHeights[String(record.id)] || 0}px` : '0',
                opacity: isExpanded ? 1 : 0,
                overflow: 'hidden',
                transition: 'all 300ms ease-in-out',
              }}
              className="bg-gray-50 border-t border-gray-200"
            >
              <div ref={(el) => { if (el) contentRefs.current[String(record.id)] = el; }} className="p-4">
                <div className="mb-6">
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="text-lg font-semibold text-gray-700">Деталі операції</h3>
										{/* Delete button (only visible to admin) */}
										{isAdmin && showDelete && onDeleteRecord && (
											<div className="ml-2" onClick={(e) => e.stopPropagation()}>
												<Button
													size="sm"
													variant="flat"
													color="danger"
													className="bg-red-200 h-auto px-2.5 py-1.5 gap-1.5 opacity-60"
													isLoading={loadingDeleteId === String(record.id)}
													isDisabled={!!loadingLoadId}
													startContent={loadingDeleteId !== String(record.id) ? <DynamicIcon name="trash-2" className="w-3 h-3" /> : undefined}
													onPress={() => handleDeleteRecord(String(record.id))}
												>
													Видалити
												</Button>
											</div>
										)}
										 {/* Confirm modal rendered here so header button can open it */}
										<ConfirmModal
											isOpen={confirmDeleteId === String(record.id)}
											title="Видалити запис?"
											message={`Запис №${record.id} буде видалений безповоротно.`}
											confirmText="Видалити"
											cancelText="Скасувати"
											confirmColor="danger"
											onConfirm={handleConfirmDelete}
											onCancel={handleCancelDelete}
										/>
                    {/* Edit button (optional) */}
                    {isAdmin && showEdit && onEditRecord && (
                      <div className="ml-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="flat"
                          color="default"
                          className="h-auto px-2.5 py-1.5 gap-1.5"
                          isLoading={loadingEditId === String(record.id)}
                          isDisabled={!!loadingLoadId}
                          startContent={<DynamicIcon name="edit-3" className="w-3 h-3" />}
                          onPress={() => handleEditRecord(String(record.id))}
                        >
                          Редагувати
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[13px] text-gray-500 flex-wrap">
                    <span>Автор: <b>{record.createdByName || record.createdBy || record.created_by || '—'}</b></span>
                    <span className="border-l border-gray-300 pl-3">Фірма: <b>{(getFirmDisplayName(record.firmId) || 'Не визначено')}</b></span>
                    <span className="border-l border-gray-300 pl-3">Дата створення: <b>{formatDate(record.createdAt || record.created_at)}</b></span>
                    {cfg.dateField && formatDate(record.createdAt || record.created_at) !== formatDate(record[cfg.dateField]) && (
                      <span className="bg-amber-100 text-gray-700 px-1.5 py-0.5 rounded">Дата {cfg.dateField ? cfg.storageOperation || cfg.label.toLowerCase() : ''}: <span className="font-semibold">{record[cfg.dateField] ? formatDate(record[cfg.dateField]) : '—'}</span></span>
                    )}
                  </div>
                  {record.comment && <p className="text-[13px] text-gray-500 mt-1">Коментар: <b>{record.comment}</b></p>}
                </div>

                {/* Items: for releaseSet render separate table per set, otherwise single table */}
                <div className="mb-6">
                  {recordType === 'releaseSet' ? (
                    <div className="space-y-4">
                      {items.map((setItem: any, setIdx: number) => {
                        const setSku = setItem.set_sku || '';
                        const setName = setItem.name || `Набір ${setSku}`;
                        const setQty = Number(setItem.quantity ?? setItem.qty ?? 0);
                        const comps = Array.isArray(setItem.components_snapshot) ? setItem.components_snapshot : (Array.isArray(setItem.componentsSnapshot) ? setItem.componentsSnapshot : []);
                        const compsTotal = comps.reduce((s: number, c: any) => s + (Number(c.quantity ?? c.qty ?? 0)), 0);
                        return (
                          <div key={`set-table-${setIdx}`} className="rounded-md overflow-hidden border border-gray-200">
                            <div className="flex items-center gap-2 px-2 py-2 bg-gray-200">
															<span className="text-sm bg-amber-200/80 ring-1 ring-amber-100 px-1 py-0 rounded">{setSku}</span>
                              <h4 className="text-md font-medium text-gray-700">{setName}
																<span className="text-xs mx-2">✕</span>
																<span>{setQty} шт.</span>
															</h4>
                            </div>
                            <div className="overflow-x-auto px-1 pb-1 bg-gray-200">
                              <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md text-sm bg-white">
                                <thead>
                                  <tr className="border-b border-gray-200 bg-gray-100 [&>th]:text-left [&>th]:py-2 [&>th]:px-3 [&>th]:font-semibold [&>th]:text-gray-600">
                                    <th>SKU</th>
                                    <th>Позиція</th>
                                    <th>Партія</th>
                                    <th className="text-center!">Кількість</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {comps.map((c: any, compIdx: number) => {
                                    const compSku = c.sku || c.id || c.set_sku || '';
                                    const compName = c.name || c.title || '';
                                    const totalPerSet = Number(c.quantity ?? c.qty ?? 1);
                                    return (
                                      <tr key={`set-${setIdx}-comp-${compIdx}`} className="[&>td]:py-2 [&>td]:px-3 [&>td]:border-b [&>td]:border-b-gray-100 text-gray-700">
                                        <td className="font-mono">{compSku}</td>
                                        <td>{compName}</td>
                                        <td>{c.batchNumber || c.batchId || '–'}</td>
                                        <td className="text-center font-semibold">{totalPerSet}</td>
                                      </tr>
                                    );
                                  })}
                                  <tr className="bg-gray-50 [&>td]:font-semibold [&>td]:py-2 [&>td]:px-3">
                                    <td></td>
                                    <td></td>
                                    <td className="text-right">Всього:</td>
                                    <td className="text-center">{compsTotal}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 justify-between px-3 py-2 rounded-t-md border-1 border-b-0 border-gray-200 bg-gray-200">
                        <h4 className="text-md font-medium text-gray-700">Товари</h4>
                      </div>
                      <div className="overflow-x-auto px-1 pb-1 bg-gray-200 rounded-b-md"> 
                        <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md text-sm bg-white border-1 border-gray-200">
                          <thead>
														<tr className="border-b border-gray-200 bg-gray-100 [&>th]:text-left [&>th]:py-2 [&>th]:px-3 [&>th]:font-semibold [&>th]:text-gray-600">
															<th>SKU</th>
															<th>Позиція</th>
															<th>Партія</th>
															<th className="text-center!">Кількість</th>
														</tr>
													</thead>
                          <tbody>
                            {items.map((item: any, idx: number) => {
                              const name = item.name || item.productName || item.title || item.sku || '';
                              const qty = Number(item.quantity ?? item.qty ?? 0);
                              return (
                                <tr key={idx} className="[&>td]:py-2 [&>td]:px-3 [&>td]:border-b [&>td]:border-b-gray-100 text-gray-700">
                                  <td className="font-mono">{item.sku}</td>
                                  <td>{name}</td>
                                  <td>{item.batchNumber || item.batchId || '–'}</td>
                                  <td className="text-center font-semibold">{qty}</td>
                                </tr>
                              );
                            })}
                            <tr className="bg-gray-50 [&>td]:font-semibold [&>td]:py-2 [&>td]:px-3">
                              <td></td>
                              <td></td>
                              <td className="text-right">Всього:</td>
                              <td className="text-center">{items.reduce((s: number, it: any) => s + Number(it.quantity ?? it.qty ?? 0), 0)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HistoryAccordionTable;
