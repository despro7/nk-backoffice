import { useState } from 'react';
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { totalPortions } from '../WarehouseInventoryUtils';
import CompactBalance from './CompactBalance';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: any[]; // refresh report items
  sessionItems: any[]; // items from the session to compute facts
  inventoryDate?: string | null;
  isApplying?: boolean;
  onApply?: () => Promise<void>;
  onRefresh?: (() => Promise<void>) | undefined;
}

const InventoryRefreshReportModal = ({ isOpen, onClose, items, sessionItems, inventoryDate, isApplying, onApply, onRefresh }: Props) => {
  const [sortColumnProd, setSortColumnProd] = useState<'sku' | 'name' | 'systemBalance'>('sku');
  const [sortDirectionProd, setSortDirectionProd] = useState<'ascending' | 'descending'>('ascending');
  const [sortColumnMat, setSortColumnMat] = useState<'sku' | 'name' | 'systemBalance'>('sku');
  const [sortDirectionMat, setSortDirectionMat] = useState<'ascending' | 'descending'>('ascending');

  const handleSort = (column: 'sku' | 'name' | 'systemBalance', forMaterials = false) => {
    if (forMaterials) {
      if (sortColumnMat === column) setSortDirectionMat(sortDirectionMat === 'ascending' ? 'descending' : 'ascending');
      else { setSortColumnMat(column); setSortDirectionMat('ascending'); }
    } else {
      if (sortColumnProd === column) setSortDirectionProd(sortDirectionProd === 'ascending' ? 'descending' : 'ascending');
      else { setSortColumnProd(column); setSortDirectionProd('ascending'); }
    }
  };

  const getSortIcon = (column: 'sku' | 'name' | 'systemBalance', forMaterials = false) => {
    if (forMaterials) {
      if (sortColumnMat !== column) return 'arrow-up-down';
      return sortDirectionMat === 'ascending' ? 'arrow-up' : 'arrow-down';
    }
    if (sortColumnProd !== column) return 'arrow-up-down';
    return sortDirectionProd === 'ascending' ? 'arrow-up' : 'arrow-down';
  };

  const products = items.filter((it) => it.type !== 'material');
  const materials = items.filter((it) => it.type === 'material');

  const sortList = (list: any[], column: 'sku' | 'name' | 'systemBalance', dir: 'ascending' | 'descending') => {
    return [...list].sort((a, b) => {
      const order = dir === 'ascending' ? 1 : -1;
      switch (column) {
        case 'sku': return order * String(a.sku ?? '').localeCompare(String(b.sku ?? ''));
        case 'name': return order * String(a.name ?? '').localeCompare(String(b.name ?? ''));
        case 'systemBalance': return order * ((a.before ?? 0) - (b.before ?? 0));
        default: return 0;
      }
    });
  };

  return (
    <Modal isOpen={isOpen} scrollBehavior="inside" isDismissable={false} onClose={onClose} size="5xl">
      <ModalContent>
        <ModalHeader>Звіт оновлення залишків на {inventoryDate ?? '—'}</ModalHeader>
        <ModalBody>
          {items.length === 0 ? (
            <p className="text-sm text-gray-600">Нічого не змінено.</p>
          ) : (
            <div className="space-y-4">
              {products.length > 0 && (
                <div>
                  <h4 className="text-md font-medium text-gray-700 mb-2">Товари</h4>
                  <div className="overflow-x-auto mb-2">
                    <table className="w-full text-sm bg-white border-1 border-gray-200">
                      <thead>
                        <tr className="bg-gray-100 border-b">
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('sku', false)}>
                            <div className="flex items-center gap-1">SKU <DynamicIcon name={getSortIcon('sku', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                          </th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('name', false)}>
                            <div className="flex items-center gap-1">Позиція <DynamicIcon name={getSortIcon('name', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                          </th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('systemBalance', false)}>
                            <div className="flex items-center justify-center gap-1">Було <DynamicIcon name={getSortIcon('systemBalance', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                          </th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600">Стало</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600">Δ</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600">Факт</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600">Відх.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortList(products, sortColumnProd, sortDirectionProd).map((it, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-100/80">
                            <td className="py-2 px-3 font-mono">{it.sku}</td>
                            <td className="py-2 px-3">{it.name || ''}</td>
                            <td className="py-2 px-3 text-center">{(() => {
                              const sessionItem = sessionItems.find((si) => si.sku === it.sku);
                              if (sessionItem && sessionItem.unit === 'portions') return <CompactBalance total={it.before} portionsPerBox={sessionItem.portionsPerBox} sessionItem={sessionItem} />;
                              return it.before ?? '–';
                            })()}</td>
                            <td className="py-2 px-3 text-center">{it.after ?? '–'}</td>
                            <td className={`py-2 px-3 text-center font-semibold ${((it.after ?? 0) - (it.before ?? 0)) === 0 ? 'text-gray-600' : ((it.after ?? 0) - (it.before ?? 0)) > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                              {(it.after ?? 0) - (it.before ?? 0) > 0 ? `+${(it.after ?? 0) - (it.before ?? 0)}` : `${(it.after ?? 0) - (it.before ?? 0)}`}
                            </td>
                            {(() => {
                              const sessionItem = sessionItems.find((si) => si.sku === it.sku);
                              const fact = sessionItem ? totalPortions(sessionItem) : null;
                              const deltaFact = fact === null ? null : (fact - (it.after ?? 0));
                              return (
                                <>
                                  <td className={`py-2 px-3 text-center ${fact === null ? 'text-gray-300' : ''}`}>{fact === null ? '–' : (sessionItem && sessionItem.unit === 'portions' ? <CompactBalance total={fact} portionsPerBox={sessionItem.portionsPerBox} sessionItem={sessionItem} /> : String(fact))}</td>
                                  <td className={`py-2 px-3 text-center font-semibold ${deltaFact === null || deltaFact === 0 ? 'text-gray-600' : deltaFact > 0 ? 'text-blue-600' : 'text-red-500'}`}>{deltaFact === null ? '–' : (deltaFact > 0 ? `+${deltaFact}` : `${deltaFact}`)}</td>
                                </>
                              );
                            })()}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {materials.length > 0 && (
                <div>
                  <h4 className="text-md font-medium text-gray-700 mb-2">Матеріали</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm bg-white border-1 border-gray-200">
                      <thead>
                        <tr className="bg-gray-100 border-b">
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('sku', true)}>
                            <div className="flex items-center gap-1">SKU <DynamicIcon name={getSortIcon('sku', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                          </th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('name', true)}>
                            <div className="flex items-center gap-1">Позиція <DynamicIcon name={getSortIcon('name', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                          </th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('systemBalance', true)}>
                            <div className="flex items-center justify-center gap-1">Було <DynamicIcon name={getSortIcon('systemBalance', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                          </th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600">Стало</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600">Δ</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600">Факт</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-600">Відх.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortList(materials, sortColumnMat, sortDirectionMat).map((it, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="py-2 px-3 font-mono">{it.sku}</td>
                            <td className="py-2 px-3">{it.name || ''}</td>
                            <td className="py-2 px-3 text-center">{(() => {
                              const sessionItem = sessionItems.find((si) => si.sku === it.sku);
                              if (sessionItem && sessionItem.unit === 'portions') return <CompactBalance total={it.before} portionsPerBox={sessionItem.portionsPerBox} sessionItem={sessionItem} />;
                              return it.before ?? '–';
                            })()}</td>
                            <td className="py-2 px-3 text-center">{it.after ?? '–'}</td>
                            <td className={`py-2 px-3 text-center font-semibold ${((it.after ?? 0) - (it.before ?? 0)) === 0 ? 'text-gray-600' : ((it.after ?? 0) - (it.before ?? 0)) > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                              {(it.after ?? 0) - (it.before ?? 0) > 0 ? `+${(it.after ?? 0) - (it.before ?? 0)}` : `${(it.after ?? 0) - (it.before ?? 0)}`}
                            </td>
                            {(() => {
                              const sessionItem = sessionItems.find((si) => si.sku === it.sku);
                              const fact = sessionItem ? totalPortions(sessionItem) : null;
                              const deltaFact = fact === null ? null : (fact - (it.after ?? 0));
                              return (
                                <>
                                  <td className={`py-2 px-3 text-center ${fact === null ? 'text-gray-300' : ''}`}>{fact === null ? '–' : (sessionItem && sessionItem.unit === 'portions' ? <CompactBalance total={fact} portionsPerBox={sessionItem.portionsPerBox} sessionItem={sessionItem} /> : String(fact))}</td>
                                  <td className={`py-2 px-3 text-center font-semibold ${deltaFact === null || deltaFact === 0 ? 'text-gray-600' : deltaFact > 0 ? 'text-blue-600' : 'text-red-500'}`}>{deltaFact === null ? '–' : (deltaFact > 0 ? `+${deltaFact}` : `${deltaFact}`)}</td>
                                </>
                              );
                            })()}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <div className="flex items-center gap-2">
            <Button variant="solid" color="primary" isLoading={!!isApplying} isDisabled={!onApply || !!isApplying} onPress={async () => { if (!onApply) return; await onApply(); }}>
              Застосувати
            </Button>
            <Button variant="flat" color="default" onPress={onClose}>Скасувати</Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default InventoryRefreshReportModal;
