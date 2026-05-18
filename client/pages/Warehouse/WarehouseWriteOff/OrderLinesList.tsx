import { Button } from '@heroui/react';

interface Props {
  orderDetails: any;
  disabledSkus: Record<string, boolean>;
  onAddLine: (sku: string, line: any, maxQty: number) => void;
}

export default function OrderLinesList({ orderDetails, disabledSkus, onAddLine }: Props) {
  if (!orderDetails || !Array.isArray(orderDetails.items)) return null;
  return (
    <>
      <h2 className="font-medium mb-2">Рядки замовлення</h2>
      <div className="py-1 px-4 mb-6 bg-white rounded-xl">
        {orderDetails.items.map((line: any, idx: number) => {
          const sku = line.sku || line.parameter || line.barcode || line.productSku || line.code;
          const name = line.productName || line.text || line.title || line.name || sku;
          const maxQty = Number(line.quantity || line.amount || line.orderedQuantity || 0);
          return (
            <div key={idx} className="flex items-center justify-between gap-4 py-3 border-b last:border-b-0">
              <div className={!!disabledSkus[sku] ? 'opacity-30' : ''}>
                <div className="font-medium">{name}</div>
                <div className="text-sm text-gray-500">SKU: {sku}</div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="md"
                  color="danger"
                  onPress={() => { void onAddLine(sku, line, maxQty); }}
                  isDisabled={!!disabledSkus[sku]}
                >
                  {!!disabledSkus[sku] ? 'Додано до списання' : 'Додати'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
