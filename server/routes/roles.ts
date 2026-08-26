import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { RoleError, roleService } from '../services/RoleService.js';
import { listRegisteredActions, PERMISSION_GROUP_LABELS } from '../../shared/constants/permissions.js';
import { productsCatalogService } from '../modules/Products/ProductsCatalogService.js';

const router = Router();
const rolesManage = requirePermission('roles', 'manage', 'Керувати ролями');
const guard = [authenticateToken, rolesManage] as const;

function handleRoleError(res: Response, error: unknown) {
  if (error instanceof RoleError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error('Roles API error:', error);
  return res.status(500).json({ message: 'Помилка керування ролями' });
}

router.get('/', ...guard, async (_req: Request, res: Response) => {
  try {
    const roles = await roleService.listRoles();
    res.json(roles);
  } catch (error) {
    handleRoleError(res, error);
  }
});

router.get('/catalog', ...guard, async (_req: Request, res: Response) => {
  try {
    res.json({
      groups: PERMISSION_GROUP_LABELS,
      permissions: listRegisteredActions().map(({ key, group, label }) => ({ key, group, label })),
    });
  } catch (error) {
    handleRoleError(res, error);
  }
});

router.get('/catalog-folders', ...guard, async (_req: Request, res: Response) => {
  try {
    const folders = await productsCatalogService.getTree({ includeTrash: true });
    res.json({ folders });
  } catch (error) {
    handleRoleError(res, error);
  }
});

router.get('/:id', ...guard, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Некоректний id' });
    const role = await roleService.getRoleById(id);
    if (!role) return res.status(404).json({ message: 'Роль не знайдена' });
    res.json(role);
  } catch (error) {
    handleRoleError(res, error);
  }
});

router.post('/', ...guard, async (req: Request, res: Response) => {
  try {
    const role = await roleService.createRole(req.body ?? {});
    res.status(201).json(role);
  } catch (error) {
    handleRoleError(res, error);
  }
});

router.put('/reorder', ...guard, async (req: Request, res: Response) => {
  try {
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = raw.map((value: unknown) => Number(value));
    const roles = await roleService.reorderRoles(ids);
    res.json(roles);
  } catch (error) {
    handleRoleError(res, error);
  }
});

router.put('/:id', ...guard, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Некоректний id' });
    const role = await roleService.updateRole(id, req.body ?? {});
    res.json(role);
  } catch (error) {
    handleRoleError(res, error);
  }
});

router.put('/:id/permissions', ...guard, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Некоректний id' });
    const keys = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const role = await roleService.setPermissions(id, keys);
    res.json(role);
  } catch (error) {
    handleRoleError(res, error);
  }
});

router.delete('/:id', ...guard, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Некоректний id' });
    await roleService.deleteRole(id);
    res.json({ success: true });
  } catch (error) {
    handleRoleError(res, error);
  }
});

export default router;
