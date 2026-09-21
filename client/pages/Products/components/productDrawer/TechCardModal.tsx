import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
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
import type { CatalogDictItemDto } from '../../ProductsTypes';
import {
  buildTechCardRows,
  formatTechCardMassKg,
  type TechCardMassPrecision,
} from '../../ProductsUtils';
import type { BomRow } from './productDrawerTypes';
import { parseSpecQtyInput } from './productDrawerUtils';
import { exportTechCardExcel, exportTechCardPdf, printTechCardPdf } from './techCardExport';

const DEFAULT_TECH_CARD_PORTIONS = 1000;

const MASS_PRECISION_OPTIONS: Array<{ key: TechCardMassPrecision; label: string }> = [
  { key: 'auto', label: 'Авто' },
  { key: 0, label: '0' },
  { key: 1, label: '1' },
  { key: 2, label: '2' },
  { key: 3, label: '3' },
];

const TECH_CARD_TABLE_CLASS_NAMES = {
  th: 'bg-default-100 text-default-600 text-xs font-semibold first:rounded-l-md last:rounded-r-md',
  td: 'text-sm py-2',
};

const TOTALS_ROW_CLASS = 'bg-default-200 [&_td]:first:rounded-l-md [&_td]:last:rounded-r-md';
const TOTALS_CELL_CLASS = 'font-semibold text-default-900 tabular-nums text-right';

interface TechCardModalProps {
  isOpen: boolean;
  productName: string;
  components: BomRow[];
  units: CatalogDictItemDto[];
  specQty: string;
  onClose: () => void;
  overlayZClassName?: string;
}

function parseMassPrecision(value: string): TechCardMassPrecision {
  if (value === 'auto') return 'auto';
  const n = Number(value);
  if (n >= 0 && n <= 3) return n as 0 | 1 | 2 | 3;
  return 'auto';
}

export function TechCardModal({
  isOpen,
  productName,
  components,
  units,
  specQty,
  onClose,
  overlayZClassName,
}: TechCardModalProps) {
  const parsedSpecQty = parseSpecQtyInput(specQty);
  const [portions, setPortions] = useState(String(DEFAULT_TECH_CARD_PORTIONS));
  const [massPrecision, setMassPrecision] = useState<TechCardMassPrecision>('auto');
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPortions(String(DEFAULT_TECH_CARD_PORTIONS));
    setMassPrecision('auto');
  }, [isOpen]);

  const safePortions = Number(portions) > 0 ? Number(portions) : 1;

  const techCard = useMemo(
    () =>
      buildTechCardRows(
        components.map((c) => ({
          componentName: c.componentName,
          qty: c.qty,
          unitId: c.unitId,
          componentWeight: c.componentWeight,
          note: c.note,
          cookingLossPercent: c.cookingLossPercent,
        })),
        units,
        parsedSpecQty,
        safePortions,
        massPrecision
      ),
    [components, units, parsedSpecQty, safePortions, massPrecision]
  );

  const handlePrint = async () => {
    if (techCard.rows.length === 0) {
      ToastService.show({
        title: 'Немає даних',
        description: 'Додайте позиції у специфікацію перед друком',
        color: 'warning',
      });
      return;
    }

    setPrinting(true);
    try {
      await printTechCardPdf(productName, parsedSpecQty, safePortions, techCard);
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
    if (techCard.rows.length === 0) {
      ToastService.show({
        title: 'Немає даних',
        description: 'Додайте позиції у специфікацію перед збереженням',
        color: 'warning',
      });
      return;
    }

    setExporting(true);
    try {
      if (format === 'pdf') {
        await exportTechCardPdf(productName, parsedSpecQty, safePortions, techCard);
      } else {
        await exportTechCardExcel(productName, parsedSpecQty, safePortions, techCard);
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: 'tech-card-modal max-w-4xl',
        wrapper: overlayZClassName,
        backdrop: overlayZClassName,
      }}
    >
      <ModalContent>
        <ModalHeader className="border-b border-default-200 shrink-0">
          <span className="text-lg font-semibold">Техкарта «{productName}»</span>
        </ModalHeader>
        <ModalBody className="py-4 gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <NumberInput
              label="Кіл-ть порцій на варку"
              value={portions}
              min={1}
              decimalPlaces={0}
              className="w-48"
              onValueChange={setPortions}
              classNames={{
                input: 'text-lg font-semibold leading-none',
              }}
            />
            <Select
              label="Точність маси"
              aria-label="Точність маси нетто/брутто"
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
            <Dropdown placement="bottom-end" classNames={{ trigger: 'ml-auto', content: 'min-w-20' }}>
              <DropdownTrigger>
                <Button
                  variant="flat"
                  color="success"
                  isLoading={exporting}
                  isDisabled={exporting || techCard.rows.length === 0}
                  startContent={
                    !exporting ? <DynamicIcon name="file-down" size={16} /> : undefined
                  }
                >
                  Завантажити
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Формат збереження техкарти"
                onAction={(key) => {
                  if (key === 'pdf' || key === 'excel') {
                    void handleExport(key);
                  }
                }}
              >
                <DropdownItem key="pdf" startContent={<DynamicIcon name="file-text" size={14} />}>
                  PDF
                </DropdownItem>
                <DropdownItem
                  key="excel"
                  startContent={<DynamicIcon name="file-spreadsheet" size={14} />}
                >
                  Excel
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>

          <Table
            aria-label="Техкарта"
            removeWrapper
            classNames={TECH_CARD_TABLE_CLASS_NAMES}
          >
            <TableHeader>
              <TableColumn>Інгредієнт</TableColumn>
              <TableColumn className="text-right">Вага за рецептом</TableColumn>
              <TableColumn className="text-right">Втрати</TableColumn>
              <TableColumn className="text-right">Маса нетто</TableColumn>
              <TableColumn className="text-right">Маса брутто</TableColumn>
            </TableHeader>
            <TableBody emptyContent="Немає позицій у специфікації">
              {[
                ...techCard.rows.map((row) => (
                  <TableRow key={`${row.name}-${row.recipeDisplay}`}>
                    <TableCell>{row.nameDisplay}</TableCell>
                    <TableCell className="tabular-nums text-right">{row.recipeDisplay}</TableCell>
                    <TableCell className="tabular-nums text-right text-default-500">
                      {row.lossDisplay}
                    </TableCell>
                    <TableCell className="tabular-nums text-right font-medium">
                      {row.netDisplay}
                    </TableCell>
                    <TableCell className="tabular-nums text-right font-medium">
                      {row.grossDisplay}
                    </TableCell>
                  </TableRow>
                )),
                ...(techCard.rows.length > 0
                  ? [
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
                          {formatTechCardMassKg(
                            techCard.totalGrossMassKg,
                            techCard.massPrecision
                          )}
                        </TableCell>
                      </TableRow>,
                    ]
                  : []),
              ]}
            </TableBody>
          </Table>

          {techCard.nonMassCount > 0 && (
            <p className="text-xs text-default-500">
              {techCard.nonMassCount} поз. без масової одиниці — не входять у підсумки маси
            </p>
          )}
        </ModalBody>
        <ModalFooter className="border-t border-default-200 shrink-0">
          <Button variant="light" onPress={onClose}>
            Закрити
          </Button>
          <Button
            color="primary"
            isDisabled={printing || exporting || techCard.rows.length === 0}
            startContent={
              <DynamicIcon
                name={printing ? 'loader-circle' : 'printer'}
                size={16}
                className={printing ? 'animate-spin' : ''}
              />
            }
            onPress={() => void handlePrint()}
          >
            Друкувати техкарту
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
