import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import HistoryAccordionItem from '../../shared/HistoryAccordionItem';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useDebug } from '@/contexts/DebugContext';
import { useState } from 'react';

function DebugDilovodCheck({ mapped, onRefresh }: { mapped: any[]; onRefresh?: () => void }) {
  const [results, setResults] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setBusy(true);
    setResults(null);
    setOpen(true);
    try {
      const toCheck = mapped.filter(m => m.dilovodDocId).map(m => ({ id: Number(m.id), dilovodDocId: m.dilovodDocId }));
      const resp = await fetch('/api/warehouse/releases/check-dilovod-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: toCheck }),
      });
      const json = await resp.json().catch(() => ({ success: false }));
      if (resp.ok && json && json.success) {
        setResults(json.results || []);
      } else {
        setResults([{ id: 'batch', success: false, error: json.error || `HTTP ${resp.status}` }]);
      }
    } catch (e) {
      setResults([{ id: 'batch', success: false, error: String(e) }]);
    } finally {
      setBusy(false);
      onRefresh && onRefresh();
    }
  };


  return (
    <>
      <div className="mb-2">
        <Button
          size="sm"
          variant="flat"
          color="warning"
          className="bg-yellow-200 text-yellow-900 hover:opacity-90"
          onPress={run}
          startContent={<DynamicIcon name="refresh-cw" className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />}
        >
          Перевірити Dilovod (debug)
        </Button>
      </div>

      <Modal isOpen={open} scrollBehavior="inside" onClose={() => setOpen(false)} size="3xl" className="max-h-[60vh]" isDismissable={!busy}>
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 text-lg font-semibold pr-10">
            <span>Результати перевірки Dilovod</span>
            {results && (
              <span className="ml-auto text-sm text-gray-500">{results.length} записів</span>
            )}
            {results && (
              <div className="ml-4 flex items-center gap-2 text-sm font-medium">
                <span className="inline-flex px-2 py-0.5 rounded bg-red-100 text-red-700">Видалені: {results.filter((x:any)=>x.success && x.delMark).length}</span>
                <span className="inline-flex px-2 py-0.5 rounded bg-amber-100 text-amber-800">Помилки: {results.filter((x:any)=>!x.success).length}</span>
              </div>
            )}
          </ModalHeader>
          <ModalBody className="space-y-2">
            {busy && <div className="text-sm text-gray-500">Виконується перевірка...</div>}
            {!busy && results && results.length === 0 && <div className="text-sm text-gray-500">Результатів немає.</div>}
            {!busy && results && (
              <ul className="text-sm">
                {results.map((r: any, i: number) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2 border-b border-gray-100">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="font-medium">Випуск №{r.id}</div>
                        <div>
                          {r.success ? (
                            r.delMark ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-50 text-red-700 text-xs font-semibold">Видалено{r.updated ? ' • оновлено' : ''}</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-semibold">OK</span>
                            )
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-xs font-semibold">Помилка</span>
                          )}
                        </div>
                      </div>
                      {(r.remark || r.comment) && (
                        <div className="text-sm text-indigo-600 mt-1">{r.remark ?? r.comment}</div>
                      )}
                    </div>
                    <div className="text-xs text-right text-gray-400 font-mono pt-1">{String(r.dilovodDocId)}</div>
                    {/* retry removed */}
                  </li>
                ))}
              </ul>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => { setOpen(false); setResults(null); }}>
              Закрити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

interface Props { records: any[]; loading?: boolean; onRefresh?: () => void; onDelete?: (id: number) => void; title?: string; emptyMessage?: string }

export default function ReleaseHistoryTab({ records = [], loading, onRefresh, onDelete, title = 'Минулі операції', emptyMessage = 'Немає записів' }: Props) {
  const { isDebugMode } = useDebug();
  // Map release records to the shape expected by WriteOffHistoryTable.
  const mapped = records.map((r: any) => {
    const items = Array.isArray(r.items) && r.items.length > 0
      ? r.items
      : [{ sku: r.setSku || '', quantity: Number(r.quantity ?? r.qty ?? 0) }];

    return {
      id: String(r.id),
      createdAt: r.createdAt || r.created_at || r.created_at,
      createdBy: r.createdBy || r.created_by,
      firmId: r.firmId || r.firm_id,
      storageId: r.storageId || r.payload?.storage,
      comment: r.comment,
      dilovodDocId: r.dilovodDocId || r.dilovod_doc_id || null,
      operationType: r.operationType || r.operation_type || null,
      items,
    };
  });

  const handleDeleteRecord = async (id: string) => {
    // `WriteOffHistoryTable` expects `onDeleteRecord(recordId)` with string id
    if (!onDelete) return;
    // try to coerce back to number if original handler expects number
    const numeric = Number(id);
    await onDelete(isNaN(numeric) ? id as any : numeric);
  };

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">{title} {records.length > 0 && ` (${records.length})`}</h2>
        <div className="flex gap-2">
          {isDebugMode && <DebugDilovodCheck mapped={mapped} onRefresh={onRefresh} />}

          <Button
            size="sm"
            variant="flat"
            color="secondary"
            className="bg-blue-200 text-blue-900 hover:opacity-90"
            onPress={onRefresh}
            startContent={<DynamicIcon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Оновити
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Завантаження...</div>
      ) : mapped.length === 0 ? (
        <div className="text-sm text-gray-500">{emptyMessage}</div>
      ) : (
        <HistoryAccordionItem
          records={mapped}
          recordType="releaseSet"
          onDeleteRecord={handleDeleteRecord}
        />
      )}
    </>
  );
}
