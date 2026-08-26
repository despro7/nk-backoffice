import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { INSUFFICIENT_ROLE_HEADER } from '../../shared/constants/roles.js';
import { registerAction } from '../../shared/constants/permissions.js';
import { roleService } from '../services/RoleService.js';

export type PermissionGuard = RequestHandler & { key: string };

export function sendInsufficientRole(res: Response, message: string) {
  res.setHeader(INSUFFICIENT_ROLE_HEADER, '1');
  return res.status(403).json({
    success: false,
    error: 'Insufficient permissions',
    code: 'INSUFFICIENT_ROLE',
    message,
  });
}

function permissionGuard(
  hasPermissionFn: (slug: string, key: string) => Promise<boolean>,
  key: string
): PermissionGuard {
  const mw = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Authentication required',
        code: 'NO_AUTH',
        details: 'You need to be authenticated to access this resource',
      });
    }

    if (req.user.userId === 0) {
      return next();
    }

    const allowed = await hasPermissionFn(req.user.role, key);
    if (!allowed) {
      return sendInsufficientRole(res, `Required permission: ${key}`);
    }

    next();
  };
  return Object.assign(mw, { key });
}

export function createRequirePermission(
  hasPermissionFn: (slug: string, key: string) => Promise<boolean>
) {
  return (group: string, name: string, label: string): PermissionGuard => {
    const key = registerAction(group, name, label);
    return permissionGuard(hasPermissionFn, key);
  };
}

export function createRequirePermissionKey(
  hasPermissionFn: (slug: string, key: string) => Promise<boolean>
) {
  return (key: string): PermissionGuard => permissionGuard(hasPermissionFn, key);
}

const hasRolePermission = (slug: string, key: string) =>
  roleService.hasPermission(slug, key);

export const requirePermission = createRequirePermission(hasRolePermission);

/** Перевіряє вже зареєстрований ключ (page.* або action.*) без registerAction. */
export const requirePermissionKey = createRequirePermissionKey(hasRolePermission);
