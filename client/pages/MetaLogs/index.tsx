import React, { useState } from 'react';
import { Tabs, Tab, Button } from '@heroui/react';
import ShipmentMetaLogTable from './components/ShipmentMetaLogTable';
import DocumentMetaLogTable from './components/DocumentMetaLogTable';
import OtherMetaLogTable from './components/OtherMetaLogTable';
import useMetaLogs from './hooks/useMetaLogs';
import { useNotifications } from '../../hooks/useNotifications';
import { ToastService } from '../../services/ToastService';
import { useAuth } from '../../contexts/AuthContext';
import { DynamicIcon } from 'lucide-react/dynamic';

export default function MetaLogNotifications() {
  const { rowsShipment, rowsOther, rowsDoc, loading, totalUnique, totalOccurrences, reload } = useMetaLogs();
  const { hideOneGlobal } = useNotifications();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const handleResolve = async (ids: Array<number | string>) => {
    try {
      // hide all source ids in parallel
      await Promise.all((ids || []).map(id => hideOneGlobal(Number(id))));
      // reload meta logs to reflect change
      reload();
      ToastService.show({ title: 'Вирішено', description: 'Повідомлення сховано', color: 'success', hideIcon: false });
    } catch (err) {
      // swallow — notifications service already logs
    }
  };
  const [activeTab, setActiveTab] = useState<'shipment'|'doc'|'other'>('shipment');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 justify-between">
        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as 'shipment'|'doc'|'other')}
          variant="solid"
          color="default"
          size="lg"
          classNames={{
            tabList: "gap-2 p-[6px] bg-gray-100 rounded-lg",
            cursor: "bg-secondary text-white shadow-sm rounded-md",
            tab: "px-3 py-1.5 text-sm font-normal data-[hover-unselected=true]:opacity-100 text-neutral-500",
            tabContent: "group-data-[selected=true]:text-white text-neutral-400",
          }}
        >
            <Tab key="shipment" title="Відвантаження замовлень" />
            <Tab key="doc" title="Збереження документів" />
            <Tab key="other" title="Інші помилки" />
        </Tabs>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              <span className="mr-4">Унікальних помилок: <strong>{totalUnique}</strong></span>
              <span>Всього записів (спроб): <strong>{totalOccurrences}</strong></span>
            </div>
            <div>
              <Button color="primary" size="sm" onPress={reload} className=""><DynamicIcon name="refresh-cw" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Оновити</Button>
            </div>
          </div>
      </div>
        {activeTab === 'shipment' && (
          <ShipmentMetaLogTable rows={rowsShipment} title="Відвантаження замовлень" isAdmin={isAdmin} onResolve={handleResolve} loading={loading} />
        )}

        {activeTab === 'doc' && (
          <DocumentMetaLogTable rows={rowsDoc} title="Збереження документів" isAdmin={isAdmin} onResolve={handleResolve} loading={loading} />
        )}

        {activeTab === 'other' && (
          <OtherMetaLogTable rows={rowsOther} title="Інші помилки" isAdmin={isAdmin} onResolve={handleResolve} loading={loading} />
        )}
    </div>
  );
}
