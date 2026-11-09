import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { normalizeBatchPortions } from '@shared/utils/catalogQtyFormula';
import type { TechCardPdfRecipe } from '../techCardExport/techCardPdfRecipe';
import { DynamicIcon } from 'lucide-react/dynamic';
import { NumberInput } from '@/components/NumberInput';
import { ToastService } from '@/services/ToastService';
import {
  buildTechCardRows,
  formatTechCardMassKg,
  type TechCardMassPrecision,
} from '@/pages/Products/ProductsUtils';
import type { CatalogDictItemDto, CatalogGoodComponentDto } from '@shared/types/catalog';
import type { CatalogLossEntry, CatalogLossFormula, ProductionLossType } from '@shared/types/production';

const DEFAULT_PORTIONS = 1000;

const MASS_PRECISION_OPTIONS: Array<{ key: TechCardMassPrecision; label: string }> = [
  { key: 'auto', label: 'Авто' },
  { key: 0, label: '0' },
  { key: 1, label: '1' },
  { key: 2, label: '2' },
  { key: 3, label: '3' },
];

const TABLE_CLASS_NAMES = {
  th: 'bg-default-100 text-default-600 text-xs font-semibold first:rounded-l-md last:rounded-r-md',
  td: 'text-sm py-2 align-top',
};

const TOTALS_ROW_CLASS = 'bg-default-200 [&_td]:first:rounded-l-md [&_td]:last:rounded-r-md';
const TOTALS_CELL_CLASS = 'font-semibold text-default-900 tabular-nums text-right';

function parseMassPrecision(value: string): TechCardMassPrecision {
  if (value === 'auto') return 'auto';
  const n = Number(value);
  if (n >= 0 && n <= 3) return n as 0 | 1 | 2 | 3;
  return 'auto';
}

function formatLossSplit(losses: CatalogLossEntry[] | null, typeNames: Map<number, string>): string | null {
  if (!losses?.length) return null;
  return losses
    .map((e) => `${typeNames.get(e.typeId) ?? `Тип #${e.typeId}`} ${e.percent.toLocaleString('uk-UA', { maximumFractionDigits: 2 })}%`)
    .join(', ');
}

interface TechCardCompositionProps {
  productName: string;
  components: CatalogGoodComponentDto[];
  units: CatalogDictItemDto[];
  specQty: number | null;
  lossFormula: CatalogLossFormula;
  lossTypes: ProductionLossType[];
  /** «Порцій на варку» (N) техкарти – початкове значення «Порцій на варку» */
  batchPortions?: number;
  /** Етапи, пакування, дозування для PDF; без нього PDF містить лише склад */
  pdfRecipe?: TechCardPdfRecipe | null;
  /**
   * Режим редагування: «Порцій на варку» – це N техкарти (зберігається в чернетці).
   * Без нього поле – калькулятор перегляду без збереження.
   */
  onBatchPortionsChange?: (portions: number) => void;
}

/** «Склад» техкарти: рядки специфікації, перерахунок на N порцій, експорт і друк. */
export function TechCardComposition({
  productName,
  components,
  units,
  specQty,
  lossFormula,
  lossTypes,
  batchPortions = DEFAULT_PORTIONS,
  pdfRecipe = null,
  onBatchPortionsChange,
}: TechCardCompositionProps) {
  const [portions, setPortions] = useState(String(batchPortions));
  const [massPrecision, setMassPrecision] = useState<TechCardMassPrecision>('auto');
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const safeSpecQty = specQty != null && specQty > 0 ? specQty : 1;
  const safePortions = Number(portions) > 0 ? Number(portions) : 1;
  const typeNames = useMemo(() => new Map(lossTypes.map((t) => [t.id, t.name])), [lossTypes]);

  const techCard = useMemo(
    () =>
      buildTechCardRows(
        components.map((c) => ({
          componentName: c.componentName || c.componentGoodId,
          qty: c.qty,
          unitId: c.unitId ?? '',
          componentWeight: c.componentWeight ?? null,
          note: c.note,
          cookingLossPercent: c.cookingLossPercent,
          losses: c.losses,
          rowKey: c.rowKey,
          qtyFormula: c.qtyFormula,
        })),
        units,
        safeSpecQty,
        safePortions,
        massPrecision,
        lossFormula,
      ),
    [components, units, safeSpecQty, safePortions, massPrecision, lossFormula],
  );

  const isEmpty = techCard.rows.length === 0;

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const { printTechCardPdf } = await import('../techCardExport/techCardPdfExport');
      await printTechCardPdf(productName, safeSpecQty, safePortions, techCard, pdfRecipe);
    } catch (err) {
      ToastService.show({
        title: 'Помилка друку',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setPrinting(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      if (format === 'pdf') {
        const { exportTechCardPdf } = await import('../techCardExport/techCardPdfExport');
        await exportTechCardPdf(productName, safeSpecQty, safePortions, techCard, pdfRecipe);
      } else {
        const { exportTechCardExcel } = await import('../techCardExport/techCardExcelExport');
        await exportTechCardExcel(productName, safeSpecQty, safePortions, techCard);
      }
    } catch (err) {
      ToastService.show({
        title: 'Помилка збереження',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="space-y-3">
      {/* Мобільні: поля і кнопки ділять ширину порівну; з md – як раніше */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="flex gap-3">
        <NumberInput
          label="Порцій на варку"
          value={portions}
          min={1}
          decimalPlaces={0}
          className="min-w-0 flex-1 md:w-44 md:flex-none"
          classNames={{ input: 'text-lg font-semibold leading-none translate-y-[3px]', inputWrapper: 'border-1 border-default-200' }}
          onValueChange={(v) => {
            setPortions(v);
            if (onBatchPortionsChange && Number(v) >= 1) onBatchPortionsChange(normalizeBatchPortions(v));
          }}
        />
        <Select
          label="Точність маси"
          aria-label="Точність маси нетто / брутто"
          selectedKeys={new Set([String(massPrecision)])}
          classNames={{ base: 'min-w-0 flex-1 md:w-36 md:flex-none', trigger: 'bg-content1 data-[open=true]:bg-content2 data-[hover=true]:bg-content2 border-1 border-default-200' }}
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            if (key != null) setMassPrecision(parseMassPrecision(String(key)));
          }}
        >
          {MASS_PRECISION_OPTIONS.map((option) => (
            <SelectItem key={String(option.key)}>{option.label}</SelectItem>
          ))}
        </Select>
        </div>
        <div className="flex gap-2 md:ml-auto">
          <Dropdown placement="bottom-end" classNames={{ content: 'min-w-20' }}>
            <DropdownTrigger>
              <Button
                className="flex-1 md:flex-none"
                variant="flat"
                color="success"
                isDisabled={exporting || isEmpty}
                startContent={
                  <DynamicIcon
                    name={exporting ? 'loader-2' : 'file-down'}
                    size={16}
                    className={exporting ? 'animate-spin' : ''}
                  />
                }
              >
                Завантажити
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Формат збереження техкарти"
              onAction={(key) => {
                if (key === 'pdf' || key === 'excel') void handleExport(key);
              }}
            >
              <DropdownItem key="pdf" startContent={<DynamicIcon name="file-text" size={14} />}>
                PDF
              </DropdownItem>
              <DropdownItem key="excel" startContent={<DynamicIcon name="file-spreadsheet" size={14} />}>
                Excel
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
          <Button
            className="flex-1 md:flex-none"
            color="primary"
            isDisabled={printing || exporting || isEmpty}
            startContent={
              <DynamicIcon
                name={printing ? 'loader-2' : 'printer'}
                size={16}
                className={printing ? 'animate-spin' : ''}
              />
            }
            onPress={() => void handlePrint()}
          >
            Друкувати
          </Button>
        </div>
      </div>

      <p className="text-xs text-default-500">
        Формула брутто:{' '}
        {lossFormula === 'sequential' ? 'послідовна' : 'адитивна'}.
      </p>

      {/* Таблиця прокручується всередині себе, не розпирає макет на вузьких екранах */}
      <div className="-mx-1 overflow-x-auto px-1">
      <Table aria-label="Склад техкарти" removeWrapper classNames={{ ...TABLE_CLASS_NAMES, table: 'min-w-[560px]', tr: 'border-b border-default-200/70 last:border-b-0' }}>
        <TableHeader>
          <TableColumn>Інгредієнт</TableColumn>
          <TableColumn className="text-right">Вага за рецептом</TableColumn>
          <TableColumn className="text-right">Втрати</TableColumn>
          <TableColumn className="text-right">Маса нетто</TableColumn>
          <TableColumn className="text-right">Маса брутто</TableColumn>
        </TableHeader>
        <TableBody emptyContent="Немає позицій у специфікації">
          {[
            ...techCard.rows.map((row, idx) => {
              const split = formatLossSplit(row.losses, typeNames);
              return (
                <TableRow key={`${idx}-${row.name}`}>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {row.nameDisplay}
                      {row.derived && (
                        <span
                          className="inline-flex text-default-400"
                          title={`На варку: ${row.derived.k.toLocaleString('uk-UA')} × ${row.derived.sourceName} + ${row.derived.b.toLocaleString('uk-UA')} = ${row.derived.batchQtyDisplay}`}
                        >
                          <DynamicIcon name="sigma" size={13} />
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums text-right">{row.recipeDisplay}</TableCell>
                  <TableCell className="tabular-nums text-right text-default-500">
                    <span>{row.lossDisplay}</span>
                    {split && <span className="block text-xs text-default-400">{split}</span>}
                  </TableCell>
                  <TableCell className="tabular-nums text-right font-medium">{row.netDisplay}</TableCell>
                  <TableCell className="tabular-nums text-right font-medium">{row.grossDisplay}</TableCell>
                </TableRow>
              );
            }),
            ...(isEmpty
              ? []
              : [
                  <TableRow key="totals" className={TOTALS_ROW_CLASS}>
                    <TableCell className="font-semibold text-default-900">Разом</TableCell>
                    <TableCell className={TOTALS_CELL_CLASS}>
                      {formatTechCardMassKg(techCard.totalRecipeMassKg)}
                    </TableCell>
                    <TableCell>{''}</TableCell>
                    <TableCell className={TOTALS_CELL_CLASS}>
                      {formatTechCardMassKg(techCard.totalNetMassKg, techCard.massPrecision)}
                    </TableCell>
                    <TableCell className={TOTALS_CELL_CLASS}>
                      {formatTechCardMassKg(techCard.totalGrossMassKg, techCard.massPrecision)}
                    </TableCell>
                  </TableRow>,
                ]),
          ]}
        </TableBody>
      </Table>
      </div>

      {techCard.nonMassCount > 0 && (
        <p className="text-xs text-default-500">
          {techCard.nonMassCount} поз. без масової одиниці – не входять у підсумки маси
        </p>
      )}
    </section>
  );
}
