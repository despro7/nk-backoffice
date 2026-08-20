import type { NextFunction, Request, Response } from 'express';
import { INSUFFICIENT_ROLE_HEADER } from '../../shared/constants/roles.js';
import { roleService } from '../services/RoleService.js';

export function sendInsufficientRole(res: Response, message: string) {
  res.setHeader(INSUFFICIENT_ROLE_HEADER, '1');
  return res.status(403).json({
    success: false,
    error: 'Insufficient permissions',
    code: 'INSUFFICIENT_ROLE',
    message,
  });
}

export function createRequirePermission(
  hasPermissionFn: (slug: string, key: string) => Promise<boolean>
) {
  return (key: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
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
  };
}

export const requirePermission = createRequirePermission((slug, key) =>
  roleService.hasPermission(slug, key)
);
