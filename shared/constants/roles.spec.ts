import { describe, expect, it } from 'vitest';
import { ROLES, canApplyRolePreview, isRolePreviewExemptPath } from './roles';

describe('canApplyRolePreview', () => {
  it('rejects non-admin real role', () => {
    expect(canApplyRolePreview(ROLES.BOSS, ROLES.STOREKEEPER, true)).toBe(false);
  });

  it('rejects preview of admin', () => {
    expect(canApplyRolePreview(ROLES.ADMIN, ROLES.ADMIN, true)).toBe(false);
  });

  it('allows existing custom slug for admin', () => {
    expect(canApplyRolePreview(ROLES.ADMIN, 'night-shift', true)).toBe(true);
  });

  it('rejects unknown slug when roleExists is false', () => {
    expect(canApplyRolePreview(ROLES.ADMIN, 'ghost', false)).toBe(false);
  });

  it('falls back to system roles when roleExists omitted', () => {
    expect(canApplyRolePreview(ROLES.ADMIN, ROLES.STOREKEEPER)).toBe(true);
    expect(canApplyRolePreview(ROLES.ADMIN, 'night-shift')).toBe(false);
  });
});

describe('isRolePreviewExemptPath', () => {
  it('exempts session and roles catalog', () => {
    expect(isRolePreviewExemptPath('/api/auth/profile')).toBe(true);
    expect(isRolePreviewExemptPath('/api/roles')).toBe(true);
    expect(isRolePreviewExemptPath('/api/roles/1/permissions')).toBe(true);
    expect(isRolePreviewExemptPath('/api/auth/users')).toBe(false);
  });
});
