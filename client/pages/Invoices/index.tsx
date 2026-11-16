import { useState } from 'react';
import { Button, Tab } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import PageTabs from '@/components/PageTabs';
import { parseUrlHash, useUrlHashSync } from '@/hooks/useUrlHashSync';
import InvoiceNewTab from './InvoiceNewTab';
import InvoiceSettingsModal from './InvoiceSettingsModal';
import InvoicesArchiveTab from './InvoicesArchiveTab';
import InvoicesDashboardTab from './InvoicesDashboardTab';
import { INVOICES_TAB_KEYS, INVOICES_TAB_LABELS, parseInvoicesTabKey, type InvoicesTabKey } from './invoicesTabs';

/** Admin only: dashboard of hours and payments, archive and generator of invoices. */
export default function InvoicesPage() {
  const [activeTab, setActiveTab] = useState<InvoicesTabKey>(() => parseInvoicesTabKey(parseUrlHash(window.location.hash).get('tab')));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  useUrlHashSync({ tab: activeTab === 'dashboard' ? null : activeTab }, (params) => {
    setActiveTab(parseInvoicesTabKey(params.get('tab')));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Рахунки</h1>
        <p className="text-sm text-default-500">Облік часу й оплат, архів і швидке створення рахунку та акта. Доступно лише адміну.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTabs selectedKey={activeTab} onSelectionChange={(key: unknown) => setActiveTab(parseInvoicesTabKey(String(key)))} aria-label="Розділи рахунків">
          {INVOICES_TAB_KEYS.map((key) => (
            <Tab key={key} title={INVOICES_TAB_LABELS[key]} />
          ))}
        </PageTabs>
        <Button size="sm" className="bg-slate-600 text-white hover:bg-slate-700 font-medium" startContent={<DynamicIcon name="settings-2" size={16} />} onPress={() => setSettingsOpen(true)}>
          Реквізити й налаштування
        </Button>
      </div>

      {activeTab === 'dashboard' ? <InvoicesDashboardTab refreshKey={dataVersion} /> : null}
      {activeTab === 'archive' ? <InvoicesArchiveTab refreshKey={dataVersion} /> : null}
      {activeTab === 'new' ? (
        <InvoiceNewTab
          onCreated={() => {
            setDataVersion((v) => v + 1);
            setActiveTab('archive');
          }}
        />
      ) : null}

      <InvoiceSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
