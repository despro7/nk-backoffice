import { useEffect, useState, useCallback } from 'react';
import type { MetaLogRow } from '@shared/types/metaLog';

type UseMetaLogsResult = {
  rowsShipment: MetaLogRow[];
  rowsOther: MetaLogRow[];
  rowsDoc: MetaLogRow[];
  loading: boolean;
  totalUnique: number;
  totalOccurrences: number;
  reload: () => void;
};

function resolveInitiatorString(initiatedBy: any, tag?: any) {
  if (!initiatedBy && tag) return typeof tag === 'string' ? tag : JSON.stringify(tag);
  if (!initiatedBy) return null;
  if (typeof initiatedBy === 'string') return initiatedBy;
  if (typeof initiatedBy === 'object') return initiatedBy.name ?? initiatedBy.raw ?? JSON.stringify(initiatedBy);
  return String(initiatedBy);
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(',', '.').replace(/[^0-9.\-]/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function extractFromMessage(m: string) {
  const parsed: any = {};
  if (!m) return parsed;
  const skuMatch = m.match(/арт[:\s]*([A-Za-z0-9\-_.]+)/i);
  if (skuMatch) parsed.sku = skuMatch[1].trim();
  const neededMatch = m.match(/(?:потріб\w*|need|required|quantity|qty|count)[:\s]*([\d\.,]+)/i);
  if (neededMatch) parsed.needed = toNumber(neededMatch[1]);
  const stockMatch = m.match(/(?:залишок|stock|available|balance)[:\s]*([\d\.,]+)/i);
  if (stockMatch) parsed.stock = toNumber(stockMatch[1]);
  const missingMatch = m.match(/(?:браку\w*|missing|недостатн\w*|недостаток|недостач)[:\s]*([\d\.,]+)/i);
  if (missingMatch) parsed.missing = toNumber(missingMatch[1]);
  let nameMatch = m.match(/-\s*([^|\n]+?)\s*(?:\||$)/);
  if (!nameMatch) nameMatch = m.match(/:\s*([^|\n]+?)\s*(?:\||$)/);
  if (nameMatch) parsed.productName = nameMatch[1].trim();
  const attemptsMatch = m.match(/(attempts|retries|спроб)[:\s]*([\d]+)/i);
  if (attemptsMatch) parsed.attempts = toNumber(attemptsMatch[2]);
  // try common short patterns like "5 шт" after product name
  if (!parsed.needed) {
    const qtyShort = m.match(/(?:\b|\s)([\d]+)\s*(?:шт\.|шт\b|pcs|pcs\.|pieces|x)\b/i);
    if (qtyShort) {
      // avoid interpreting SKU as quantity (e.g., арт 03004)
      const num = qtyShort[1];
      if (!(parsed.sku && String(parsed.sku) === String(num))) {
        parsed.needed = toNumber(num);
      }
    }
  }
  // pattern: "Name - 2 шт" or "Name — 2 pcs"
  if (!parsed.needed) {
    const nearName = m.match(/[-–—]\s*([\d]+)\s*(?:шт\.|шт\b|pcs|pieces|x)\b/);
    if (nearName) {
      const num = nearName[1];
      if (!(parsed.sku && String(parsed.sku) === String(num))) parsed.needed = toNumber(num);
    }
  }
  // pattern: ": 2" after field separator
  if (!parsed.needed) {
    const afterName = m.match(/:\s*([\d]+)\s*(?:шт\.|шт\b|pcs|pieces|x)?\b/);
    if (afterName) {
      const num = afterName[1];
      // ensure the number is not actually the SKU/арт nearby
      const idx = m.indexOf(afterName[0]);
      const prefix = m.slice(Math.max(0, idx - 12), idx).toLowerCase();
      if (!/(арт|art|sku|код|артикул)/i.test(prefix) && !(parsed.sku && String(parsed.sku) === String(num))) {
        parsed.needed = toNumber(num);
      }
    }
  }
  return parsed;
}

export function useMetaLogs(): UseMetaLogsResult {
  const [rows, setRows] = useState<MetaLogRow[]>([]);
  const [rowsShipment, setrowsShipment] = useState<MetaLogRow[]>([]);
  const [rowsOther, setRowsOther] = useState<MetaLogRow[]>([]);
  const [rowsDoc, setRowsDoc] = useState<MetaLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=500');
      const json = await res.json();
      const notifications = json?.data ?? [];
      const selected = notifications.filter((n: any) => {
        const cat = (n.category || '').toLowerCase();
        const title = (n.title || '').toLowerCase();
        const msg = (n.message || '').toLowerCase();
        const isAuto = cat.includes('dilovod') || title.includes('відвантаж') || cat.includes('export');
        const isDocError = title.includes('документ не збережено') || msg.includes('документ не збережено');
        const isWarehouseIssue = cat.includes('warehouse') || title.includes('автофінал') || msg.includes('автофінал') || title.includes('автофіналіза');
        const isProductSync = cat.includes('product_sync')
          || title.includes('товар без')
          || title.includes('штрих-код')
          || title.includes('помилка синхронізації');
        return isAuto || isDocError || isWarehouseIssue || isProductSync;
      });
      const fetchDetail = async (n: any) => {
        try {
          const r = await fetch(`/api/meta-logs/${n.id}`);
          if (!r.ok) return n;
          return await r.json();
        } catch (err) {
          return n;
        }
      };
      const full = await Promise.all(selected.map(fetchDetail));
      const mapAuto = new Map<string, { row: MetaLogRow; count: number }>();
      const mapDoc = new Map<string, { row: MetaLogRow; count: number }>();
      const mapOther = new Map<string, { row: MetaLogRow; count: number }>();

      for (const log of full) {
        const id = log.id;
        const createdAt = log.datetime ?? log.createdAt ?? new Date().toISOString();
        const orderNumber = log.orderNumber ?? null;
        const initiator = resolveInitiatorString(log.initiatedBy ?? log.tag, log.tag);
        const rawMessage = log.message ?? (log.data && typeof log.data === 'object' ? JSON.stringify(log.data) : log.data) ?? null;
        const items = log.data?.items ?? log.data?.products ?? null;
        // check export error text and other error fields for explicit numbers
        const errText = String(log.data?.exportResult?.error ?? log.data?.error ?? log.message ?? rawMessage ?? '');
        const parseErrorNumbers = (text: string) => {
          const out: { needed?: number | null; stock?: number | null; missing?: number | null } = {};
          if (!text) return out;
          const need = text.match(/потріб\w*[:\s]*([\d\.,]+)/i) || text.match(/Потрібно[:\s]*([\d\.,]+)/i);
            if (need) out.needed = toNumber(need[1]);
          const free = text.match(/(?:вільн\w*\s*залишок|вільний\s*залишок|залишок|Вільний залишок|Вільний\s*залишок)[:\s]*([\d\.,]+)/i);
            if (free) out.stock = toNumber(free[1]);
          const miss = text.match(/(?:бракує|недостатн\w*|Недостатньо|Недостатня кількість|Недостатньо)[:\s]*([\d\.,]+)/i);
            if (miss) out.missing = toNumber(miss[1]);
          return out;
        };
        const extractedFromError = parseErrorNumbers(errText);
        const parsedRows: MetaLogRow[] = [];
        const isDocErrorLog = ((log.title || '').toLowerCase().includes('документ не збережено')) || ((log.message || '').toLowerCase().includes('документ не збережено'));
        const isWarehouseLog = ((log.category || '').toLowerCase().includes('warehouse')) || ((log.title || '').toLowerCase().includes('автофінал')) || ((log.message || '') || '').toLowerCase().includes('автофінал') || ((log.title || '').toLowerCase().includes('автофіналіза'));
        const isProductSyncLog = ((log.category || '').toLowerCase().includes('product_sync'))
          || ((log.title || '').toLowerCase().includes('товар без'))
          || ((log.title || '').toLowerCase().includes('штрих-код'));

        if (Array.isArray(items) && items.length > 0) {
          items.forEach((it: any, idx: number) => {
            const authorFromData = log.data?.authorName ?? (log.data?.author && (typeof log.data.author === 'string' ? log.data.author : log.data.author.name)) ?? null;
            const docNumber = log.data?.docNumber ?? log.data?.doc_number ?? log.data?.docId ?? null;
            const dilovodResp = log.data?.dilovodResponse ?? log.data?.dilovod_response ?? log.data?.dilovodResult ?? log.data?.dilovodResponseString ?? null;
            const authorFromMsgMatch = (log.data && log.data.authorName) ? null : null;
            parsedRows.push({
              id: `${id}_${idx}`,
              createdAt,
              title: log.title ?? null,
              author: authorFromData ?? null,
              docNumber: docNumber ?? null,
              dilovodResponse: dilovodResp ?? null,
              orderNumber,
              productName: it.name ?? it.title ?? it.productName ?? null,
              sku: it.sku ?? it.code ?? null,
              needed: toNumber(it.needed ?? it.quantity ?? it.qty ?? it.count ?? it.requested ?? it.required ?? it.need ?? it.need_qty ?? it.requiredQuantity ?? it.qtyRequested ?? it['потрібно'] ?? it['кількість'] ?? it.amount) ?? (extractedFromError.needed ?? null),
              stock: toNumber(it.stock ?? it.available ?? it.systemBalance ?? it.balance ?? it.qty_left ?? it.availableQty ?? it.balance_qty) ?? (extractedFromError.stock ?? null),
              missing: (it.missing != null) ? toNumber(it.missing) : (extractedFromError.missing != null ? toNumber(extractedFromError.missing) : ((toNumber(it.needed ?? it.quantity ?? it.qty ?? it.count) != null && toNumber(it.stock ?? it.available) != null) ? Math.max(0, (toNumber(it.needed ?? it.quantity ?? it.qty ?? it.count) as number - (toNumber(it.stock ?? it.available) as number))) : null)),
              initiator,
              attempts: log.data?.attempts ?? log.data?.attemptCount ?? log.data?.retries ?? null,
              rawMessage,
              occurrenceCount: 1,
              sourceIds: [log.id],
              attemptsList: [{ id: log.id, datetime: createdAt, initiator }],
            });
          });
        } else if (log.data && (log.data.sku || log.data.product || log.data.quantity || log.data.productData)) {
          const authorFromData = log.data?.authorName ?? (log.data?.author && (typeof log.data.author === 'string' ? log.data.author : log.data.author.name)) ?? null;
          const docNumber = log.data?.docNumber ?? log.data?.doc_number ?? log.data?.docId ?? null;
          const dilovodResp = log.data?.dilovodResponse ?? log.data?.dilovod_response ?? log.data?.dilovodResult ?? null;
          const productData = log.data?.productData && typeof log.data.productData === 'object' ? log.data.productData : null;
          parsedRows.push({
            id,
            createdAt,
            title: log.title ?? null,
            author: authorFromData ?? null,
            docNumber: docNumber ?? null,
            dilovodResponse: dilovodResp ?? null,
            orderNumber,
            productName: log.data.productName ?? log.data.product ?? productData?.name ?? null,
            sku: log.data.sku ?? productData?.sku ?? null,
            needed: toNumber(log.data.quantity ?? log.data.needed ?? log.data.qty ?? log.data.count ?? log.data.required ?? log.data['потрібно'] ?? log.data.need ?? log.data.need_qty ?? log.data.qtyRequested ?? log.data['кількість'] ?? log.data.amount) ?? (extractedFromError.needed ?? null),
            stock: toNumber(log.data.stock ?? log.data.available ?? log.data.balance ?? log.data.availableQty) ?? (extractedFromError.stock ?? null),
            missing: (log.data.missing != null) ? toNumber(log.data.missing) : (extractedFromError.missing != null ? toNumber(extractedFromError.missing) : ((toNumber(log.data.quantity ?? log.data.needed ?? log.data.qty ?? log.data.count) != null && toNumber(log.data.stock ?? log.data.available) != null) ? Math.max(0, (toNumber(log.data.quantity ?? log.data.needed ?? log.data.qty ?? log.data.count) as number - (toNumber(log.data.stock ?? log.data.available) as number))) : null)),
            initiator,
            attempts: log.data.attempts ?? log.data.attemptCount ?? null,
            rawMessage,
            occurrenceCount: 1,
            sourceIds: [log.id],
            attemptsList: [{ id: log.id, datetime: createdAt, initiator }],
          });
        } else {
          const parsed = extractFromMessage(log.message ?? rawMessage ?? '');
          // ensure numeric conversion and missing calculation
          const neededVal = toNumber(parsed.needed);
          const stockVal = toNumber(parsed.stock);
          const missingVal = toNumber(parsed.missing) ?? ((neededVal != null && stockVal != null) ? Math.max(0, neededVal - stockVal) : null);

          const authorFromData = log.data?.authorName ?? (log.data?.author && (typeof log.data.author === 'string' ? log.data.author : log.data.author.name)) ?? null;
          const docNumber = log.data?.docNumber ?? log.data?.doc_number ?? log.data?.docId ?? null;
          const dilovodResp = log.data?.dilovodResponse ?? log.data?.dilovod_response ?? null;
          parsedRows.push({
            id,
            createdAt,
            title: log.title ?? null,
            author: authorFromData ?? null,
            docNumber: docNumber ?? null,
            dilovodResponse: dilovodResp ?? null,
            orderNumber,
            productName: parsed.productName ?? null,
            sku: parsed.sku ?? null,
            needed: neededVal,
            stock: stockVal,
            missing: missingVal,
            initiator,
            attempts: parsed.attempts ?? log.data?.attempts ?? null,
            rawMessage,
            occurrenceCount: 1,
            sourceIds: [log.id],
            attemptsList: [{ id: log.id, datetime: createdAt, initiator }],
          });
        }

        // if parsedRows lack numeric fields, prefer values extracted from exportResult/error text
        for (const r of parsedRows) {
          if ((r.needed === null || r.needed === undefined) && extractedFromError.needed != null) r.needed = toNumber(extractedFromError.needed) ?? extractedFromError.needed;
          if ((r.stock === null || r.stock === undefined) && extractedFromError.stock != null) r.stock = toNumber(extractedFromError.stock) ?? extractedFromError.stock;
          if ((r.missing === null || r.missing === undefined) && extractedFromError.missing != null) r.missing = toNumber(extractedFromError.missing) ?? extractedFromError.missing;
          // if missing still absent but we have needed and stock, compute it
          if ((r.missing === null || r.missing === undefined) && (r.needed != null) && (r.stock != null)) {
            const n = toNumber(r.needed) ?? null;
            const s = toNumber(r.stock) ?? null;
            if (n != null && s != null) r.missing = Math.max(0, n - s);
          }
          // Для product_sync: якщо назва не витягнулась з data — беремо з message
          if (!r.productName && typeof r.rawMessage === 'string') {
            const nameFromMsg = r.rawMessage.match(/^(.+?)\s*\(SKU:/i);
            if (nameFromMsg) r.productName = nameFromMsg[1].trim();
          }
          if (!r.sku && typeof r.rawMessage === 'string') {
            const skuFromMsg = r.rawMessage.match(/\(SKU:\s*([^)]+)\)/i) || r.rawMessage.match(/SKU:\s*([A-Za-z0-9\-_.]+)/i);
            if (skuFromMsg) r.sku = skuFromMsg[1].trim();
          }

          const key = `${r.orderNumber || ''}::${r.sku || ''}::${r.productName || ''}::${r.initiator || ''}::${r.title || ''}`;
          const targetMap = isDocErrorLog ? mapDoc : ((isWarehouseLog || isProductSyncLog) ? mapOther : mapAuto);
          const existing = targetMap.get(key);
          if (existing) {
            existing.count += 1;
            existing.row.occurrenceCount = existing.count;
            // merge sourceIds
            existing.row.sourceIds = Array.from(new Set([...(existing.row.sourceIds ?? []), ...(r.sourceIds ?? [])]));
            // merge attemptsList by id
            existing.row.attemptsList = Array.from(new Map([...(existing.row.attemptsList ?? []), ...(r.attemptsList ?? [])].map(a => [String(a.id), a])).values());
          } else {
            targetMap.set(key, { row: { ...r, occurrenceCount: 1, sourceIds: r.sourceIds ?? [r.id], attemptsList: r.attemptsList ?? [{ id: r.id, datetime: r.createdAt, initiator: r.initiator }] }, count: 1 });
          }
        }
      }

      const mergeIgnoringInitiator = (m: Map<string, { row: MetaLogRow; count: number }>) => {
        const merged = new Map<string, { row: MetaLogRow; count: number }>();
        for (const [, v] of m.entries()) {
          const r = v.row;
          const key2 = `${r.orderNumber || ''}::${r.sku || ''}::${r.productName || ''}::${r.title || ''}`;
          const existing = merged.get(key2);
          if (existing) {
            existing.count += v.count;
            // merge sourceIds
            existing.row.sourceIds = Array.from(new Set([...(existing.row.sourceIds ?? []), ...(r.sourceIds ?? [])]));
            // merge attemptsList
            existing.row.attemptsList = Array.from(new Map([...(existing.row.attemptsList ?? []), ...(r.attemptsList ?? [])].map(a => [String(a.id), a])).values());
            // merge initiators as unique list string
            const prevInit = existing.row.initiator ? String(existing.row.initiator) : '';
            const currInit = r.initiator ? String(r.initiator) : '';
            const inits = new Set<string>();
            if (prevInit) prevInit.split(',').map(s => s.trim()).filter(Boolean).forEach(x => inits.add(x));
            if (currInit) currInit.split(',').map(s => s.trim()).filter(Boolean).forEach(x => inits.add(x));
            existing.row.initiator = Array.from(inits).join(', ');
            // attempts: keep existing or fallback
            // attempts will be derived from unique attemptsList length later
            // createdAt: keep earliest
            try {
              const eDate = new Date(existing.row.createdAt).getTime();
              const rDate = new Date(r.createdAt).getTime();
              existing.row.createdAt = eDate <= rDate ? existing.row.createdAt : r.createdAt;
            } catch (e) {
              existing.row.createdAt = existing.row.createdAt || r.createdAt;
            }
            existing.row.occurrenceCount = existing.count;
          } else {
            merged.set(key2, { row: { ...r, occurrenceCount: v.count, sourceIds: r.sourceIds ?? [r.id] }, count: v.count });
          }
        }
        // finalize attempts based on unique attemptsList length
        return Array.from(merged.values()).map(v => {
          const row = { ...v.row, occurrenceCount: v.count } as MetaLogRow;
          const uniqueAttempts = Array.isArray(row.attemptsList) ? Array.from(new Map(row.attemptsList.map(a => [String(a.id), a])).values()) : [];
          row.attempts = uniqueAttempts.length > 0 ? uniqueAttempts.length : (row.attempts ?? v.count);
          row.attemptsList = uniqueAttempts;
          return row;
        });
      };

      const resultrowsShipment = mergeIgnoringInitiator(mapAuto);
      const resultRowsDoc = mergeIgnoringInitiator(mapDoc);
      const resultRowsOther = mergeIgnoringInitiator(mapOther);
      setrowsShipment(resultrowsShipment);
      setRowsDoc(resultRowsDoc);
      setRowsOther(resultRowsOther);
    } catch (err) {
      console.error('useMetaLogs load error', err);
      setrowsShipment([]);
      setRowsDoc([]);
      setRowsOther([]);
    } finally {
      setLoading(false);
    }
  }, [tick]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(() => setTick(t => t + 1), []);

  const totalUnique = rowsShipment.length + rowsDoc.length + rowsOther.length;
  const totalOccurrences = [rowsShipment, rowsDoc, rowsOther].reduce((s, arr) => s + arr.reduce((ss, r) => ss + (r.occurrenceCount ?? 1), 0), 0);

  return { rowsShipment, rowsOther, rowsDoc, loading, totalUnique, totalOccurrences, reload };
}

export default useMetaLogs;
