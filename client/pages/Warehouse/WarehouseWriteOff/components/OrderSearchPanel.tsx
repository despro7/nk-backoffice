import { OrderSearchInput } from '../../WarehouseReturns/components/OrderSearchInput';
import { expandProductSets } from '@/lib/orderAssemblyUtils';
import { useApi } from '@/hooks/useApi';

interface Props {
  returns: any;
  setOrderDetails: (o: any) => void;
  setSelectedOrderExternalId: (s: string | null) => void;
  setSelectedOrderIdState: (id: number | null) => void;
}

export default function OrderSearchPanel({ returns, setOrderDetails, setSelectedOrderExternalId, setSelectedOrderIdState }: Props) {
  const { apiCall } = useApi();

  return (
    <OrderSearchInput
      searchQuery={returns.searchQuery}
      onSearchQueryChange={returns.setSearchQuery}
      onSearch={async () => { await returns.handleSearch(); }}
      searchResults={returns.searchResults}
      loading={returns.searchLoading}
      hasSearchExecuted={returns.hasSearchExecuted}
      orderSelected={returns.orderSelected}
      selectedOrderId={returns.selectedOrderId}
      onSelectOrder={async (orderId: number) => {
        // Set selected order id in returns state
        returns.setSelectedOrderId(orderId);
        setSelectedOrderIdState(orderId);
        const o = returns.searchResults?.find((r: any) => r.id === orderId);
        setSelectedOrderExternalId(o?.externalId || String(orderId));

        try {
          const res = await fetch(`/api/warehouse/returns/prepare?orderId=${encodeURIComponent(String(orderId))}`, { credentials: 'include', headers: { Accept: 'application/json' } });
          if (!res.ok) { console.error('prepare fetch not ok', res.status); setOrderDetails(null); return; }
          const data = await res.json();
          const payload = data?.data || data;
          setOrderDetails(payload);

          // Expand product sets like returns flow but only replace orderDetails.items
          try {
            const priceBySku = new Map((payload.items || []).map((it: any) => [it.sku, Number(it.price ?? 0)]));
            const expanded = await expandProductSets(payload.items || [], apiCall, []);
            const expandedForOrder = (expanded || []).map((item: any) => ({
              sku: item.sku,
              productName: item.name,
              quantity: item.quantity,
              price: priceBySku.get(item.sku) ?? 0,
            }));

            // replace orderDetails.items so OrderLinesList shows expanded components
            setOrderDetails({ ...payload, items: expandedForOrder });

            // Do NOT add expanded items into returns.items here — user should click "Додати" per line.
            // Batch fetching will happen when user adds a line (handled by handleAddOrderLine).

          } catch (expErr) {
            console.error('expandProductSets error', expErr);
            // if expansion fails, leave orderDetails as-is so user can still add lines manually
            setOrderDetails(payload);
          }

        } catch (err) {
          console.error('prepare error', err);
          setOrderDetails(null);
        }
      }}
    />
  );
}
