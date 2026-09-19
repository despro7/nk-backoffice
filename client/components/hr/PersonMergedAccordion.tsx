import { useEffect, useState } from 'react';
import { Accordion, AccordionItem, Spinner } from '@heroui/react';
import { FormattedPhone } from '@/components/FormattedPhone';
import { formatDateTime } from '@/lib/formatUtils';
import type { HrPersonSummaryDto } from '@shared/types/hr';
import { hrAccordionClassNames } from './HrAuditAccordion';

interface PersonMergedAccordionProps {
  personId: number;
  mergedCount: number;
  refreshKey?: number;
}

export function PersonMergedAccordion({
  personId,
  mergedCount,
  refreshKey = 0,
}: PersonMergedAccordionProps) {
  const [merged, setMerged] = useState<HrPersonSummaryDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mergedCount <= 0) {
      setMerged([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/hr/persons/${personId}/merged`, { credentials: 'include' });
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) {
          setMerged(Array.isArray(data.data) ? data.data : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [personId, mergedCount, refreshKey]);

  if (mergedCount <= 0) return null;

  return (
    <Accordion variant="bordered" className="border-1 px-0 overflow-hidden">
      <AccordionItem
        key="merged"
        title="Обʼєднані записи"
        subtitle={`(${mergedCount} записів)`}
        classNames={hrAccordionClassNames}
      >
        {loading ? (
          <div className="flex justify-center py-4"><Spinner size="sm" /></div>
        ) : merged.length === 0 ? (
          <p className="text-sm text-default-500">Немає записів</p>
        ) : (
          <ul className="space-y-1.5">
            {merged.map((record) => (
              <li
                key={record.id}
                className="rounded-[8px] border border-default-200 bg-default-50 px-3 py-2 text-sm"
              >
                <div className="font-medium text-default-900">{record.displayName}</div>
                <div className="text-xs text-default-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {record.taxCode ? <span>ІПН: {record.taxCode}</span> : null}
                  {record.phone ? (
                    <span>Тел.: <FormattedPhone phone={record.phone} style="national" /></span>
                  ) : null}
                  {record.dilovodCode ? <span className="font-mono">#{record.dilovodCode}</span> : null}
                  {record.mergedAt ? (
                    <span>Обʼєднано: {formatDateTime(record.mergedAt)}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AccordionItem>
    </Accordion>
  );
}
