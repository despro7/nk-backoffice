import { useMemo } from 'react';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownTrigger,
} from '@heroui/react';
import type { Selection } from '@react-types/shared';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  type PayrollTableBuilderConfig,
  type PayrollTableColumnId,
} from '@shared/types/tableBuilder';
import { HR_BTN_NEUTRAL } from '@/pages/Hr/hrUi';

const COLUMN_LABELS: Record<PayrollTableColumnId, string> = {
  pdfo: 'ПДФО',
  military: 'ВЗ',
  esv: 'ЄСВ',
  bonus: 'Премії',
  total: 'Разом',
};

const SECTION_DIVIDER = { className: 'mt-1 bg-neutral-100' };

function isPdfoMilitaryMerged(config: PayrollTableBuilderConfig): boolean {
  return config.merges.some(
    (merge) => merge.columnIds.includes('pdfo') && merge.columnIds.includes('military'),
  );
}

interface TableBuilderProps {
  config: PayrollTableBuilderConfig;
  onChange: (config: PayrollTableBuilderConfig) => void;
  canSaveGlobal?: boolean;
  onSaveGlobal?: () => void;
  savingGlobal?: boolean;
}

export function TableBuilder({
  config,
  onChange,
  canSaveGlobal = false,
  onSaveGlobal,
  savingGlobal = false,
}: TableBuilderProps) {
  const pdfoMerged = isPdfoMilitaryMerged(config);

  const selectedKeys = useMemo(() => {
    const keys = new Set<string>();

    if (pdfoMerged) {
      if (config.visibleColumns.pdfo || config.visibleColumns.military) {
        keys.add('pdfo-military');
      }
    } else {
      if (config.visibleColumns.pdfo) keys.add('pdfo');
      if (config.visibleColumns.military) keys.add('military');
    }
    if (config.visibleColumns.esv) keys.add('esv');
    if (config.visibleColumns.bonus) keys.add('bonus');
    if (config.visibleColumns.total) keys.add('total');
    if (config.taxesSeparate) keys.add('taxes-separate');
    if (pdfoMerged) keys.add('merge-pdfo-vz');

    return keys;
  }, [config, pdfoMerged]);

  const handleSelectionChange = (keys: Selection) => {
    if (keys === 'all') return;

    const selected = new Set(Array.from(keys as Iterable<string>, String));
    const mergePdfoVz = selected.has('merge-pdfo-vz');
    const taxesSeparate = selected.has('taxes-separate');
    const hadMerge = pdfoMerged;

    let merges = config.merges;
    if (mergePdfoVz && !hadMerge) {
      merges = [
        ...config.merges,
        { id: 'pdfo-military', columnIds: ['pdfo', 'military'], label: 'ПДФО+ВЗ' },
      ];
    } else if (!mergePdfoVz && hadMerge) {
      merges = config.merges.filter(
        (merge) => !(merge.columnIds.includes('pdfo') && merge.columnIds.includes('military')),
      );
    }

    const mergedNow = mergePdfoVz;
    const visibleColumns = { ...config.visibleColumns };

    if (mergedNow) {
      const pdfoMilitaryVisible = selected.has('pdfo-military');
      visibleColumns.pdfo = pdfoMilitaryVisible;
      visibleColumns.military = pdfoMilitaryVisible;
      visibleColumns.esv = selected.has('esv');
    } else {
      visibleColumns.pdfo = selected.has('pdfo');
      visibleColumns.military = selected.has('military');
      visibleColumns.esv = selected.has('esv');
    }

    visibleColumns.bonus = selected.has('bonus');
    visibleColumns.total = selected.has('total');

    onChange({
      ...config,
      visibleColumns,
      taxesSeparate,
      merges,
    });
  };

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button
          size="sm"
          variant="flat"
          className={HR_BTN_NEUTRAL}
          startContent={<DynamicIcon name="columns-3" size={14} />}
          endContent={<DynamicIcon name="chevron-down" size={14} className="text-default-400" />}
        >
          Колонки
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Колонки таблиці"
        closeOnSelect={false}
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={handleSelectionChange}
        variant="flat"
        className="w-72"
        itemClasses={{ base: 'gap-2' }}
      >
        <DropdownSection title="Відображення" showDivider dividerProps={SECTION_DIVIDER}>
          <DropdownItem key="taxes-separate">Податки/премії окремо</DropdownItem>
          <DropdownItem key="merge-pdfo-vz">Обʼєднати ПДФО+ВЗ</DropdownItem>
        </DropdownSection>

        <DropdownSection title="Видимість колонок" showDivider dividerProps={SECTION_DIVIDER}>
          <DropdownItem key="pdfo-military" className={pdfoMerged ? '' : 'hidden'}>
            ПДФО+ВЗ
          </DropdownItem>
          <DropdownItem key="pdfo" className={!pdfoMerged ? '' : 'hidden'}>
            {COLUMN_LABELS.pdfo}
          </DropdownItem>
          <DropdownItem key="military" className={!pdfoMerged ? '' : 'hidden'}>
            {COLUMN_LABELS.military}
          </DropdownItem>
          <DropdownItem key="esv">{COLUMN_LABELS.esv}</DropdownItem>
          <DropdownItem key="bonus">{COLUMN_LABELS.bonus}</DropdownItem>
          <DropdownItem key="total">{COLUMN_LABELS.total}</DropdownItem>
        </DropdownSection>

        {canSaveGlobal && onSaveGlobal ? (
          <DropdownSection classNames={{ base: 'px-1 pb-1 pt-0' }}>
            <DropdownItem
              key="save-global"
              textValue="Зберегти для всіх"
              className="h-auto p-0 data-[hover=true]:bg-transparent"
              closeOnSelect={false}
              isReadOnly
            >
              <Button
                size="sm"
                color="primary"
                className="w-full"
                startContent={!savingGlobal ? <DynamicIcon name="save" size={14} /> : undefined}
                isLoading={savingGlobal}
                onPress={onSaveGlobal}
              >
                Зберегти для всіх
              </Button>
            </DropdownItem>
          </DropdownSection>
        ) : null}
      </DropdownMenu>
    </Dropdown>
  );
}
