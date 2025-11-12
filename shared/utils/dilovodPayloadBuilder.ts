// Shared utility for building Dilovod API payloads
// Can be used in both frontend and backend

export type DilovodDocumentType = 'documents.saleOrder' | 'documents.sale' | 'documents.cashIn';

export interface DilovodPayloadOptions {
  orderNumber: string;
  documentType: DilovodDocumentType;
  baseDoc?: string;
  cachedSaleOrderId?: string;
  cachedOrderNumber?: string;
}

export function buildDilovodPayload(options: DilovodPayloadOptions) {
  const { orderNumber, documentType, baseDoc, cachedSaleOrderId, cachedOrderNumber } = options;

  let fields: Record<string, string> = {
    id: "id",
    number: "number",
    date: "date",
    total: "total",
    currency: "currency",
    status: "status"
  };

  if (documentType === 'documents.saleOrder') {
    fields["customer"] = "customer";
    fields["customer.name"] = "customerName";
  } else if (documentType === 'documents.sale') {
    fields["storage"] = "storage";
    fields["baseDoc"] = "baseDoc";
  } else if (documentType === 'documents.cashIn') {
    fields["account"] = "account";
    fields["person"] = "person";
    fields["person.name"] = "personName";
    fields["baseDoc"] = "baseDoc";
  }

  let filters;
  if ((documentType === 'documents.sale' || documentType === 'documents.cashIn') && baseDoc) {
    filters = [
      {
        alias: "baseDoc",
        operator: "=",
        value: baseDoc
      }
    ];
  } else {
    filters = [
      {
        alias: "number",
        operator: "=",
        value: orderNumber
      }
    ];
  }

  return {
    version: "0.25",
    key: "***",
    action: "request",
    params: {
      from: documentType,
      fields,
      filters,
      limit: 10
    }
  };
}
