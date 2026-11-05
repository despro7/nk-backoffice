import type { ReactNode } from 'react';
import { Accordion, AccordionItem, Spinner } from '@heroui/react';
import { pluralize } from '@/lib/formatUtils';

/** Стилі accordion журналу змін — спільні для HR, Warehouse, Catalog. */
export const auditAccordionClassNames = {
  base: 'px-1',
  trigger: 'my-1 py-2 px-2 rounded-sm [&>div]:flex-row [&>div]:items-baseline [&>div]:gap-2 data-[open=true]:bg-default-100/75 transition-colors duration-200',
  indicator: '-rotate-180',
  title: 'text-sm font-medium text-default-500 data-[open=true]:text-default-900 transition-colors duration-200',
  subtitle: 'text-xs text-default-500',
  content: 'pb-3 px-2',
};

interface AuditAccordionProps {
  title: ReactNode;
  count: number;
  loading?: boolean;
  emptyText?: string;
  className?: string;
  onSelectionChange?: () => void;
  /** Блок під списком (напр. «Показати ще»). */
  footer?: ReactNode;
  children: ReactNode;
}

/** Згортуваний блок «Історія змін»: заголовок, лічильник, спінер, порожній стан. */
export function AuditAccordion({
  title,
  count,
  loading = false,
  emptyText = 'Змін ще немає...',
  className,
  onSelectionChange,
  footer,
  children,
}: AuditAccordionProps) {
  return (
    <div className={className}>
      <Accordion
        variant="bordered"
        className="border-1 px-0 overflow-hidden"
        onSelectionChange={onSelectionChange ? () => onSelectionChange() : undefined}
      >
        <AccordionItem
          key="audit"
          title={title}
          subtitle={`${count} ${pluralize(count, 'запис', 'записи', 'записів')}`}
          classNames={auditAccordionClassNames}
        >
          {loading && count === 0 ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : count === 0 ? (
            <p className="text-sm text-default-500/75">{emptyText}</p>
          ) : (
            <>
              <div className="divide-y divide-border-subtle">{children}</div>
              {footer}
            </>
          )}
        </AccordionItem>
      </Accordion>
    </div>
  );
}
