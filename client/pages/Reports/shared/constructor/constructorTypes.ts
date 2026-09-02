import type { ReactNode } from 'react';

export type ConstructorTabKey = 'selection' | 'grouping' | 'columns';

export const CONSTRUCTOR_TAB_LABELS: Record<ConstructorTabKey, string> = {
  selection: 'Відбір',
  grouping: 'Групування',
  columns: 'Колонки',
};

export interface ConstructorGroupingItem {
  id: string;
  label: string;
}

export interface HierarchicalTableColumn {
  id: string;
  label: string;
  /** Уточнення слота (початок / прихід…) — окремим бейджем під назвою. */
  badge?: string;
  /** Підказка біля заголовка колонки (іконка circle-question-mark). */
  headerTooltip?: string;
  align?: 'left' | 'right';
  /** Заголовок групи колонок (другий рядок шапки). */
  groupLabel?: string;
  format?: 'qty' | 'money' | 'percent' | 'text';
}

export interface HierarchicalTableRowView {
  id: string;
  kind: 'total' | 'group' | 'leaf';
  label: string;
  /** Артикул — в одному рядку з назвою, через «・». */
  sku?: string | null;
  subtitle?: string | null;
  depth: number;
  values: Record<string, number>;
  dimensionId?: string;
  valueId?: string;
  groupId?: string;
  /** Архів / delMark / смітник — червоний текст. */
  inactive?: boolean;
  children?: HierarchicalTableRowView[];
  extra?: ReactNode;
}
