import { useIsMobile } from "@/hooks/useTouchUi";

type SalesReportTableTotals = {
  ordersCount: number;
  portionsCount: number;
  totalPrice: number;
  sourceWebsite: number;
  sourceWebsitePortions: number;
  sourceRozetka: number;
  sourceRozetkaPortions: number;
  sourceProm: number;
  sourcePromPortions: number;
  sourceChat: number;
  sourceChatPortions: number;
  discountReason: number;
  discountReasonPortions: number;
};

type SalesReportTableTotalsRowProps = {
  totals: SalesReportTableTotals;
  visible: boolean;
};

export function SalesReportTableTotalsRow({
  totals,
  visible,
}: SalesReportTableTotalsRowProps) {
  const isMobile = useIsMobile();

  if (!visible) {
    return null;
  }

  const totalPriceLabel = (totals.totalPrice || 0)
    .toLocaleString("uk-UA", {
      style: "currency",
      currency: "UAH",
      maximumFractionDigits: 0,
    })
    .replace(/\s?грн\.?|UAH|₴/gi, " ₴");

  if (isMobile) {
    // На телефоні колонки таблиці не вміщаються: підсумки окремою карткою «назва → значення»
    const formatCount = (value: number) => value.toLocaleString("uk-UA");
    const items = [
      { label: "Замовлення", value: formatCount(totals.ordersCount) },
      { label: "Порції", value: formatCount(totals.portionsCount) },
      { label: "Сума", value: totalPriceLabel, wide: true },
      { label: "Сайт", value: `${formatCount(totals.sourceWebsite)} / ${formatCount(totals.sourceWebsitePortions)}` },
      { label: "Розетка", value: `${formatCount(totals.sourceRozetka)} / ${formatCount(totals.sourceRozetkaPortions)}` },
      { label: "Пром", value: `${formatCount(totals.sourceProm)} / ${formatCount(totals.sourcePromPortions)}` },
      { label: "Інше", value: `${formatCount(totals.sourceChat)} / ${formatCount(totals.sourceChatPortions)}` },
      { label: "Зі знижкою", value: `${formatCount(totals.discountReason)} / ${formatCount(totals.discountReasonPortions)}`, wide: true },
    ];

    return (
      <div className="mt-2 rounded-lg bg-default-50 p-3">
        <p className="mb-2 text-sm font-semibold text-default-900">Разом за період</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {items.map((item) => (
            <div key={item.label} className={item.wide ? "col-span-2" : undefined}>
              <dt className="text-xs text-default-500">{item.label}</dt>
              <dd className="text-sm font-bold text-default-900 tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-default-400">Джерела та знижки: замовлення / порції</p>
      </div>
    );
  }

  return (
    <div className="border-t-1 border-gray-200 py-2">
      <div className="flex items-center justify-between text-sm">
        <div className="w-3/19"></div>
        <div className="text-center font-bold text-gray-800 w-2/19">
          {totals.ordersCount}
        </div>
        <div className="text-center font-bold text-gray-800 w-2/19">
          {totals.portionsCount}
        </div>
        <div className="text-center font-bold text-gray-800 w-2/19">
          {totalPriceLabel}
        </div>
        <div className="text-center font-bold text-gray-800 w-2/19">
          {totals.sourceWebsite} / {totals.sourceWebsitePortions}
        </div>
        <div className="text-center font-bold text-gray-800 w-2/19">
          {totals.sourceRozetka} / {totals.sourceRozetkaPortions}
        </div>
        <div className="text-center font-bold text-gray-800 w-2/19">
          {totals.sourceProm} / {totals.sourcePromPortions}
        </div>
        <div className="text-center font-bold text-gray-800 w-2/19">
          {totals.sourceChat} / {totals.sourceChatPortions}
        </div>
        <div className="text-center font-bold text-gray-800 w-2/19">
          {totals.discountReason} / {totals.discountReasonPortions}
        </div>
      </div>
    </div>
  );
}