import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { INSUFFICIENT_ROLE_HEADER, REQUIRED_PERMISSION_HEADER } from '../../shared/constants/roles.js';
import {
  formatPermissionDenialMessage,
  getRegisteredActionLabel,
  registerAction,
} from '../../shared/constants/permissions.js';
import { roleService } from '../services/RoleService.js';

export type PermissionGuard = RequestHandler & { key: string };

export function sendInsufficientRole(
  res: Response,
  message: string,
  options?: { permissionKey?: string },
) {
  res.setHeader(INSUFFICIENT_ROLE_HEADER, '1');
  if (options?.permissionKey) {
    res.setHeader(REQUIRED_PERMISSION_HEADER, options.permissionKey);
  }
  return res.status(403).json({
    success: false,
    error: 'Insufficient permissions',
    code: 'INSUFFICIENT_ROLE',
    message,
    ...(options?.permissionKey ? { permissionKey: options.permissionKey } : {}),
  });
}

function permissionGuard(
  hasPermissionFn: (slug: string, key: string) => Promise<boolean>,
  key: string,
  explicitLabel?: string,
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
      return sendInsufficientRole(res, formatPermissionDenialMessage(key, explicitLabel), {
        permissionKey: key,
      });
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
    return permissionGuard(hasPermissionFn, key, label);
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

export function createRequireAnyPermissionKey(
  hasPermissionFn: (slug: string, key: string) => Promise<boolean>,
) {
  return (keys: string[]): RequestHandler => {
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

      for (const key of keys) {
        if (await hasPermissionFn(req.user.role, key)) {
          return next();
        }
      }

      const labels = keys.map((k) => getRegisteredActionLabel(k) ?? k);
      const message = `Потрібне одне з прав: ${labels.map((l) => `«${l}»`).join(', ')}`;
      return sendInsufficientRole(res, message, { permissionKey: keys.join('|') });
    };
    return mw;
  };
}

export const requireAnyPermissionKey = createRequireAnyPermissionKey(hasRolePermission);
