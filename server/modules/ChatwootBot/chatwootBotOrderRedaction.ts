import type { ChatwootBotVerifiedOrderDto, ChatwootBotVerifiedOrderItem } from '../../../shared/types/chatwootBotTools.js';

type RawOrderItem = {
  name?: string;
  title?: string;
  sku?: string;
  quantity?: number;
  price?: number;
  amount?: number;
};

function parseItems(raw: unknown): ChatwootBotVerifiedOrderItem[] {
  let list: RawOrderItem[] = [];
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw) as RawOrderItem[];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    list = raw as RawOrderItem[];
  }
  return list
    .map((item) => {
      const name = String(item.name ?? item.title ?? '').trim();
      const quantity = Number(item.quantity ?? item.amount ?? 1);
      if (!name) return null;
      const row: ChatwootBotVerifiedOrderItem = {
        name,
        quantity: Number.isFinite(quantity) ? quantity : 1,
      };
      if (item.sku) row.sku = String(item.sku);
      const price = Number(item.price);
      if (Number.isFinite(price)) row.price = price;
      return row;
    })
    .filter((x): x is ChatwootBotVerifiedOrderItem => x !== null);
}

export function toVerifiedOrderDto(order: {
  orderNumber: string;
  status: string;
  statusText: string;
  ttn: string;
  items: unknown;
}): ChatwootBotVerifiedOrderDto {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    statusText: order.statusText,
    ttn: order.ttn ?? '',
    items: parseItems(order.items),
  };
}
