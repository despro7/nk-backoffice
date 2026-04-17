import React from 'react';
import { Select, SelectItem, Input } from '@heroui/react';
import type { CashInRow, CashInOrderCandidate } from '@shared/types/cashIn';

interface CashInRowEditorProps {
  row: CashInRow;
  onResolve: (rowIndex: number, patch: Partial<CashInRow>) => void;
}

/**
 * Компонент inline-редагування рядка з помилкою валідації.
 * Рендериться як вставка всередині рядка таблиці превью.
 */
export default function CashInRowEditor({ row, onResolve }: CashInRowEditorProps) {
  // --- amount_mismatch: редагування суми ---
  if (row.status === 'amount_mismatch') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-warning-600 font-medium">
          Сума в БД: {row.dbOrderAmount?.toFixed(2)} грн — розбіжність з файлом
        </span>
        <Input
          size="sm"
          type="number"
          step="0.01"
          defaultValue={String(row.amountReceived)}
          label="Сума прийнятих коштів"
          className="max-w-[160px]"
          onBlur={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
              onResolve(row.rowIndex, { amountReceived: val, status: 'ok' });
            }
          }}
        />
      </div>
    );
  }

  // --- ambiguous: вибір замовлення зі списку ---
  if (row.status === 'ambiguous') {
    const candidates: CashInOrderCandidate[] = row.candidates ?? [];
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-warning-600 font-medium">
          Знайдено {candidates.length} замовлення — оберіть потрібне
        </span>
        <Select
          size="sm"
          label="Замовлення"
          placeholder="Оберіть замовлення"
          className="max-w-[320px]"
          onSelectionChange={(keys) => {
            const orderNumber = Array.from(keys)[0] as string;
            const candidate = candidates.find((c) => c.orderNumber === orderNumber);
            if (candidate) {
              onResolve(row.rowIndex, {
                resolvedOrderNumber: candidate.orderNumber,
                dbOrderAmount: candidate.totalPrice,
                status: 'ok',
              });
            }
          }}
        >
          {candidates.map((c) => (
            <SelectItem key={c.orderNumber} textValue={c.orderNumber}>
              <span className="font-medium">#{c.orderNumber}</span>
              <span className="text-gray-500 ml-2 text-xs">
                {new Date(c.orderDate).toLocaleDateString('uk-UA')} · {c.totalPrice.toFixed(2)} грн
              </span>
            </SelectItem>
          ))}
        </Select>
      </div>
    );
  }

  // --- not_found: ручне введення номера замовлення ---
  if (row.status === 'not_found') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-danger font-medium">
          Замовлення не знайдено — введіть номер вручну або залиште порожнім щоб пропустити
        </span>
        <Input
          size="sm"
          type="text"
          label="Номер замовлення"
          placeholder="наприклад: 14161"
          className="max-w-[200px]"
          onBlur={(e) => {
            const val = e.target.value.trim();
            if (val) {
              onResolve(row.rowIndex, { resolvedOrderNumber: val, status: 'ok' });
            }
          }}
        />
      </div>
    );
  }

  return null;
}
