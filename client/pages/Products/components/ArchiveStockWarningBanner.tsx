import { Link } from 'react-router-dom';
import { DynamicIcon } from 'lucide-react/dynamic';
import { StockBadge } from '@/components/StockBadge';
import {
  isKitGood,
  resolveCatalogItemStock,
  summarizeArchiveStockSelection,
  type CatalogItemLabel,
} from '../ProductsUtils';

interface ArchiveStockWarningBannerProps {
  items: CatalogItemLabel[];
  archiveFolderName?: string | null;
}

function ArchiveProductCard({ item }: { item: CatalogItemLabel }) {
  const { mainStock, smallStock } = resolveCatalogItemStock(item);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-default-200 bg-default-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-foreground">{item.name}</p>
        {item.sku ? (
          <p className="mt-0.5 font-mono text-xs text-default-500">SKU {item.sku}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-xs text-default-500">Залишки</span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
          <StockBadge variant="gp" size="9px" />
          <span className={mainStock < 0 ? 'text-danger' : 'text-foreground'}>{mainStock}</span>
          <span className="font-normal text-default-300">/</span>
          <StockBadge variant="ms" size="9px" />
          <span className={smallStock < 0 ? 'text-danger' : 'text-foreground'}>{smallStock}</span>
        </span>
      </div>
    </div>
  );
}

function ArchiveGroupRow({ item }: { item: CatalogItemLabel }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-default-200 bg-default-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-foreground">{item.name}</p>
        <p className="mt-0.5 text-xs text-default-500">Папка · перевірте залишки всередині</p>
      </div>
      <span className="shrink-0 text-xs text-default-400">група</span>
    </div>
  );
}

function ArchiveWhatHappensBlock({
  items,
  archiveFolderName,
}: {
  items: CatalogItemLabel[];
  archiveFolderName?: string | null;
}) {
  const summary = summarizeArchiveStockSelection(items);
  const count = items.length;
  const folderPart = archiveFolderName
    ? `перемістяться в папку «${archiveFolderName}»`
    : 'перемістяться в архів';

  return (
    <div className="space-y-2 text-sm text-default-700">
      <p>
        {count === 1 && !items[0]?.isGroup
          ? `Товар ${folderPart}.`
          : `${count} елемент(ів) ${folderPart}.`}
      </p>
      <ul className="list-disc space-y-1 pl-4">
        <li>
          На сайті WooCommerce знімається з публікації (статус «Не публікувати», чернетка) — товар
          зникне з каталогу.
        </li>
        <li>
          <span className="font-medium text-foreground">Залишки на складі не змінюються</span> —
          архівація їх не списує автоматично.
        </li>
        {summary.groupCount > 0 ? (
          <li>
            Для папок ({summary.groupCount}) перевірте залишки товарів всередині окремо.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ArchiveStockAdviceBlock({ items }: { items: CatalogItemLabel[] }) {
  const products = items.filter((item) => !item.isGroup);
  const withStock = products.filter((item) => resolveCatalogItemStock(item).total !== 0);
  if (withStock.length === 0) return null;

  const summary = summarizeArchiveStockSelection(withStock);
  const single = withStock.length === 1 ? withStock[0] : null;
  const singleTotal = single ? resolveCatalogItemStock(single).total : 0;

  return (
    <div className="rounded-lg border border-warning-300 bg-warning-50 px-4 py-3">
      <div className="flex items-start gap-2.5 text-sm text-warning-950">
        <DynamicIcon
          name="triangle-alert"
          size={18}
          className="mt-0.5 shrink-0 text-warning-600"
        />
        <div className="space-y-2">
          <p className="font-medium">
            {single
              ? `На складі ${singleTotal} пор. — перед архівацією варто врегулювати залишки.`
              : `У ${withStock.length} товар(ів) є залишки — перед архівацією варто їх врегулювати.`}
          </p>
          <ul className="list-disc space-y-1 pl-4 text-warning-900">
            {summary.kitCount > 0 ? (
              <li>
                {single && isKitGood(single) ? 'Набір' : `Набори (${summary.kitCount})`}:{' '}
                <Link
                  to="/warehouse/releases"
                  className="font-semibold underline underline-offset-2 hover:text-warning-800"
                >
                  розукомплектування
                </Link>
                {single && isKitGood(single) ? ', щоб повернути компоненти на склад.' : null}
              </li>
            ) : null}
            {summary.goodCount > 0 ? (
              <li>
                {single && !isKitGood(single) ? (
                  <>
                    Звичайний товар: перевірте фактичні залишки через{' '}
                    <Link
                      to="/warehouse/inventory"
                      className="font-semibold underline underline-offset-2 hover:text-warning-800"
                    >
                      інвентаризацію
                    </Link>{' '}
                    або оформіть списання.
                  </>
                ) : (
                  <>
                    Товари ({summary.goodCount}):{' '}
                    <Link
                      to="/warehouse/inventory"
                      className="font-semibold underline underline-offset-2 hover:text-warning-800"
                    >
                      інвентаризація
                    </Link>{' '}
                    або списання.
                  </>
                )}
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function ArchiveStockWarningBanner({
  items,
  archiveFolderName,
}: ArchiveStockWarningBannerProps) {
  if (items.length === 0) return null;

  const products = items.filter((item) => !item.isGroup);
  const groups = items.filter((item) => item.isGroup);

  return (
    <div className="space-y-4">
      <ArchiveWhatHappensBlock items={items} archiveFolderName={archiveFolderName} />

      <div className="space-y-2">
        {products.map((item) => (
          <ArchiveProductCard key={item.id} item={item} />
        ))}
        {groups.map((item) => (
          <ArchiveGroupRow key={item.id} item={item} />
        ))}
      </div>

      <ArchiveStockAdviceBlock items={items} />
    </div>
  );
}
