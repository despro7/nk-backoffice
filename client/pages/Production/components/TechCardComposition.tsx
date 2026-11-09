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
}

/** «Склад» техкарти: рядки специфікації, перерахунок на N порцій, експорт і друк. */
export function TechCardComposition({
  productName,
  components,
  units,
  specQty,
  lossFormula,
  lossTypes,
}: TechCardCompositionProps) {
  const [portions, setPortions] = useState(String(DEFAULT_PORTIONS));
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
      await printTechCardPdf(productName, safeSpecQty, safePortions, techCard);
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
        await exportTechCardPdf(productName, safeSpecQty, safePortions, techCard);
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
      <div className="flex flex-wrap items-end gap-3">
        <NumberInput
          label="Порцій на варку"
          value={portions}
          min={1}
          decimalPlaces={0}
          className="w-44"
          onValueChange={setPortions}
          classNames={{ input: 'text-lg font-semibold leading-none' }}
        />
        <Select
          label="Точність маси"
          aria-label="Точність маси нетто / брутто"
          selectedKeys={new Set([String(massPrecision)])}
          className="w-36"
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            if (key != null) setMassPrecision(parseMassPrecision(String(key)));
          }}
        >
          {MASS_PRECISION_OPTIONS.map((option) => (
            <SelectItem key={String(option.key)}>{option.label}</SelectItem>
          ))}
        </Select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Dropdown placement="bottom-end" classNames={{ content: 'min-w-20' }}>
            <DropdownTrigger>
              <Button
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
        Специфікація розрахована на {safeSpecQty.toLocaleString('uk-UA')} шт. Формула брутто:{' '}
        {lossFormula === 'sequential' ? 'послідовна' : 'адитивна'}.
      </p>

      <Table aria-label="Склад техкарти" removeWrapper classNames={TABLE_CLASS_NAMES}>
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
                  <TableCell>{row.nameDisplay}</TableCell>
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

      {techCard.nonMassCount > 0 && (
        <p className="text-xs text-default-500">
          {techCard.nonMassCount} поз. без масової одиниці – не входять у підсумки маси
        </p>
      )}
    </section>
  );
}
