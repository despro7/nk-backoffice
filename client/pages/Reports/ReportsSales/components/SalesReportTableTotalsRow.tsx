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
  if (!visible) {
    return null;
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
          {(totals.totalPrice || 0)
            .toLocaleString("uk-UA", {
              style: "currency",
              currency: "UAH",
              maximumFractionDigits: 0,
            })
            .replace(/\s?грн\.?|UAH|₴/gi, " ₴")}
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