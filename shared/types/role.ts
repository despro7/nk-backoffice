export interface RoleDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}
