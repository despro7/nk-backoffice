import { Button, Input, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { NumberInputFromNumber } from '@/components/NumberInput';
import {
  CATALOG_DEFAULT_CURRENCY_ID,
  CATALOG_MAIN_PRICE_TYPE_IDS,
  CATALOG_PRICE_TYPE_MILITARY_ID,
} from '../../ProductsTypes';
import type { CatalogDictItemDto } from '../../ProductsTypes';
import { pricesAlmostEqual, withSyncedDerivedPrices } from '../../ProductsUtils';
import type { PriceRow, RowDeleteKind } from './productDrawerTypes';
import { RowDeleteButton } from './RowDeleteButton';

interface PricesSectionProps {
  prices: PriceRow[];
  priceTypes: CatalogDictItemDto[];
  isGood: boolean;
  isKit: boolean;
  kitPortionCount: number;
  requiredPricesOk: boolean;
  mainPriceValue: number | null;
  militaryExpected: number | null;
  rowDeleteConfirm: { kind: RowDeleteKind; idx: number } | null;
  onApplyPriceRowChange: (idx: number, patch: Partial<PriceRow>) => void;
  onPricesChange: (updater: (prev: PriceRow[]) => PriceRow[]) => void;
  onRowDeleteConfirm: (next: { kind: RowDeleteKind; idx: number } | null) => void;
  isReadOnly?: boolean;
}

export function PricesSection({
  prices,
  priceTypes,
  isGood,
  isKit,
  kitPortionCount,
  requiredPricesOk,
  mainPriceValue,
  militaryExpected,
  rowDeleteConfirm,
  onApplyPriceRowChange,
  onPricesChange,
  onRowDeleteConfirm,
  isReadOnly = false,
}: PricesSectionProps) {
  return (
    <section className={`space-y-3 ${isReadOnly ? 'pointer-events-none' : ''}`}>
      <h3 className="text-sm font-semibold flex items-center gap-1">
        <DynamicIcon name="wallet" size={14} />
        <span>Ціни</span>
        {(isGood || isKit) && <span className="font-normal text-danger-500">*</span>}
      </h3>
      {!requiredPricesOk && (
        <p className="text-xs text-warning-700">
          Обовʼязково вкажіть основні ціни (Роздріб, Звичайна і Військові мають бути більші за 0 грн)
        </p>
      )}
      {prices.map((p, idx) => {
        const isMilitary = p.priceType === CATALOG_PRICE_TYPE_MILITARY_ID;
        const militaryMismatch =
          isMilitary && militaryExpected != null && !pricesAlmostEqual(p.price, militaryExpected);
        const militaryPortions = isKit ? kitPortionCount : 1;
        return (
          <div key={idx} className="flex flex-col gap-1">
            <div className="grid gap-2 grid-cols-[1fr_110px_auto]">
              {priceTypes.length > 0 ? (
                <Select
                  size="md"
                  aria-label="Тип ціни"
                  selectedKeys={p.priceType ? [p.priceType] : []}
                  classNames={{ base: 'min-w-0', popoverContent: 'bg-default-100' }}
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys)[0];
                    if (!v) return;
                    onApplyPriceRowChange(idx, { priceType: String(v) });
                  }}
                >
                  {priceTypes.map((t) => (
                    <SelectItem key={t.id}>{t.name}</SelectItem>
                  ))}
                </Select>
              ) : (
                <Input
                  size="md"
                  aria-label="Тип ціни (id)"
                  value={p.priceType}
                  onValueChange={(v) => onApplyPriceRowChange(idx, { priceType: v })}
                />
              )}
              <NumberInputFromNumber
                size="md"
                aria-label="Ціна, грн"
                value={p.price}
                decimalPlaces={2}
                min={0}
                trimTrailingZeros={false}
                isInvalid={p.price <= 0}
                color={militaryMismatch ? 'danger' : 'default'}
                endContent={<span className="text-xs text-default-400/75">грн</span>}
                onChange={(price) => onApplyPriceRowChange(idx, { price })}
              />
              <RowDeleteButton
                ariaLabel="Видалити ціну"
                className="h-full"
                confirming={rowDeleteConfirm?.kind === 'price' && rowDeleteConfirm.idx === idx}
                onRequest={() => onRowDeleteConfirm({ kind: 'price', idx })}
                onConfirm={() => {
                  onPricesChange((prev) =>
                    withSyncedDerivedPrices(
                      prev.filter((_, i) => i !== idx),
                      isKit,
                      kitPortionCount,
                      false
                    )
                  );
                  onRowDeleteConfirm(null);
                }}
              />
            </div>
            {militaryMismatch && militaryExpected != null && mainPriceValue != null && (
              <p className="text-xs text-danger">
                Очікується {militaryExpected} грн (звичайна ціна {mainPriceValue} −{' '}
                {isKit ? `${militaryPortions}×5` : '5'})
              </p>
            )}
          </div>
        );
      })}
      <Button
        size="sm"
        variant="solid"
        color="primary"
        className="bg-neutral-600/75 text-neutral-50 hover:bg-neutral-500/75"
        startContent={<DynamicIcon name="plus-circle" size={14} />}
        onPress={() => {
          if (prices.length === 0) {
            onPricesChange(() =>
              CATALOG_MAIN_PRICE_TYPE_IDS.map((priceType) => ({
                priceType,
                price: 0,
                currency: CATALOG_DEFAULT_CURRENCY_ID,
              }))
            );
            return;
          }
          onPricesChange((prev) => [
            ...prev,
            {
              priceType: priceTypes[0]?.id || '',
              price: 0,
              currency: CATALOG_DEFAULT_CURRENCY_ID,
            },
          ]);
        }}
      >
        {prices.length === 0 ? 'Додати основні ціни' : 'Додати ціну'}
      </Button>
    </section>
  );
}
