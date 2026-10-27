import type { RoleDto } from '@shared/types/role';

/** Той самий порядок, що в селекті ролі: від вищого rank до нижчого (1 = адмін). */
export function sortRolePreviewOptions(roles: RoleDto[]): RoleDto[] {
  return [...roles].sort((a, b) => b.rank - a.rank);
}
