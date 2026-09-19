import { Accordion, AccordionItem, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { FormattedPhone } from '@/components/FormattedPhone';
import type { HrPersonDto } from '@shared/types/hr';
import { hrAccordionClassNames } from './HrAuditAccordion';

interface PersonDuplicatesAccordionProps {
  duplicates: HrPersonDto[];
  loading?: boolean;
  canMerge?: boolean;
  onMerge?: () => void;
}

export function PersonDuplicatesAccordion({
  duplicates,
  loading = false,
  canMerge = false,
  onMerge,
}: PersonDuplicatesAccordionProps) {
  if (loading) {
    return <p className="text-xs text-default-500">Перевірка дублікатів…</p>;
  }
  if (duplicates.length === 0) return null;

  return (
    <Accordion variant="bordered" className="border-1 px-0 overflow-hidden">
      <AccordionItem
        key="duplicates"
        title="Можливі дублікати"
        subtitle={`(${duplicates.length} записів)`}
        classNames={hrAccordionClassNames}
      >
        <ul className="space-y-1.5">
          {duplicates.map((duplicate) => (
            <li
              key={duplicate.id}
              className="rounded-[8px] border border-default-200 bg-default-50 px-3 py-2 text-sm"
            >
              <div className="font-medium text-default-900">{duplicate.displayName}</div>
              <div className="text-xs text-default-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {duplicate.taxCode ? <span>ІПН: {duplicate.taxCode}</span> : null}
                {duplicate.phone ? (
                  <span>Тел.: <FormattedPhone phone={duplicate.phone} style="national" /></span>
                ) : null}
                {duplicate.dilovodCode ? <span className="font-mono">#{duplicate.dilovodCode}</span> : null}
              </div>
            </li>
          ))}
        </ul>
        {canMerge && onMerge ? (
          <div className="flex justify-end mt-3">
            <Button
              size="sm"
              variant="flat"
              className="bg-blue-500/20 text-blue-500 gap-1 font-medium"
              startContent={<DynamicIcon name="merge" size={14} />}
              onPress={onMerge}
            >
              Обʼєднати
            </Button>
          </div>
        ) : null}
      </AccordionItem>
    </Accordion>
  );
}
