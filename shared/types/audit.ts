import type { AuditSource } from '../constants/auditEntities.js';

/** Запис загального журналу дій (`audit_log`). */
export interface AuditLogDto {
  id: number;
  entityType: string;
  /** Id сутності як рядок (Int-id доменів серіалізуються в String). */
  entityId: string;
  action: string;
  userId: number | null;
  userName: string | null;
  source: AuditSource;
  payload: unknown;
  createdAt: string;
}

export interface AuditLogPageDto<T = AuditLogDto> {
  items: T[];
  /** id останнього запису; передай як `cursor`, щоб отримати наступну сторінку. null — кінець. */
  nextCursor: number | null;
}

/** Одна зміна поля: було → стало. */
export interface AuditFieldChange {
  field: string;
  from: unknown;
  to: unknown;
  /** Значення завеликі для журналу — збережено лише факт зміни. */
  truncated?: boolean;
}
