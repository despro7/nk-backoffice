import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { authenticateToken } from '../../middleware/auth.js';
import { requirePermission, requirePermissionKey } from '../../middleware/requirePermission.js';
import { logServer } from '../../lib/utils.js';
import { PERMISSIONS } from '../../../shared/constants/permissions.js';
import { hrService, HrError } from './HrService.js';
import { hrTimesheetService } from './HrTimesheetService.js';
import { hrPayrollService } from './HrPayrollService.js';
import { hrXlsxImportService } from './HrXlsxImportService.js';
import type {
  HrEmployeeWritePayload,
  HrEmploymentWritePayload,
  HrLegalEntityWritePayload,
  HrLegalEntityDeletePayload,
  HrPayrollFormulaUpdatePayload,
  HrPayTermsWritePayload,
  HrPayoutWritePayload,
  HrTimesheetSavePayload,
} from '../../../shared/types/hr.js';

const router = Router();

const pageEmployees = requirePermissionKey(PERMISSIONS.PAGE_HR_EMPLOYEES);
const pageTimesheet = requirePermissionKey(PERMISSIONS.PAGE_HR_TIMESHEET);
const manageEmployees = requirePermission('hr', 'employees.manage', 'Керувати співробітниками');
const managePayTerms = requirePermission('hr', 'payterms.manage', 'Керувати ставками співробітників');
const editTimesheet = requirePermissionKey(PERMISSIONS.ACTION_HR_TIMESHEET_EDIT);
const pagePayroll = requirePermissionKey(PERMISSIONS.PAGE_HR_PAYROLL);
const viewPayroll = requirePermission('hr', 'payroll.view', 'Переглядати внутрішній розрахунок виплат');
requirePermission('hr', 'payouts.view', 'Бачити повний номер картки');

const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || /\.xlsx$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Потрібен файл Excel (.xlsx)'));
    }
  },
});

function parseId(raw: string | string[] | undefined): number {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw new HrError('Некоректний ідентифікатор');
  return id;
}

async function resolveRevealCard(req: Request): Promise<boolean> {
  const { roleService } = await import('../../services/RoleService.js');
  if (!req.user?.role) return false;
  return roleService.hasPermission(req.user.role, PERMISSIONS.ACTION_HR_PAYOUTS_VIEW);
}

function sendHrError(res: Response, error: unknown, context: string) {
  if (error instanceof HrError) {
    return res.status(error.status).json({
      success: false,
      error: error.message,
      message: error.message,
      code: error.code,
    });
  }
  logServer(`[hr] ${context}`, error instanceof Error ? error.message : error);
  const message = error instanceof Error ? error.message : 'Внутрішня помилка';
  return res.status(500).json({ success: false, error: message, message });
}

router.get('/legal-entities', authenticateToken, pageEmployees, async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const data = await hrService.listLegalEntities(includeInactive);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'legal-entities');
  }
});

router.post('/legal-entities', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrService.createLegalEntity(req.body as HrLegalEntityWritePayload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create legal entity');
  }
});

router.put('/legal-entities/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrService.updateLegalEntity(parseId(req.params.id), req.body as HrLegalEntityWritePayload);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update legal entity');
  }
});

router.delete('/legal-entities/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const { targetLegalEntityId } = req.body as HrLegalEntityDeletePayload;
    if (!Number.isInteger(targetLegalEntityId) || targetLegalEntityId <= 0) {
      throw new HrError('Вкажіть роботодавця для перенесення даних');
    }
    await hrService.deleteLegalEntity(parseId(req.params.id), targetLegalEntityId);
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete legal entity');
  }
});

router.get('/users-options', authenticateToken, pageEmployees, async (req: Request, res: Response) => {
  try {
    const exclude = req.query.excludeEmployeeId ? parseId(String(req.query.excludeEmployeeId)) : undefined;
    const data = await hrService.listUserOptions(exclude);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'users-options');
  }
});

router.get('/employees', authenticateToken, pageEmployees, async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const includeInactive = req.query.includeInactive !== 'false';
    const data = await hrService.listEmployees(search, includeInactive);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'list employees');
  }
});

router.get('/employees/:id', authenticateToken, pageEmployees, async (req: Request, res: Response) => {
  try {
    const revealCard = await resolveRevealCard(req);
    const data = await hrService.getEmployee(parseId(req.params.id), revealCard);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'get employee');
  }
});

router.post('/employees', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const revealCard = await resolveRevealCard(req);
    const data = await hrService.createEmployee(req.body as HrEmployeeWritePayload, revealCard);
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create employee');
  }
});

router.put('/employees/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const revealCard = await resolveRevealCard(req);
    const data = await hrService.updateEmployee(parseId(req.params.id), req.body as HrEmployeeWritePayload, revealCard);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update employee');
  }
});

router.delete('/employees/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrService.deleteEmployee(parseId(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'delete employee');
  }
});

router.post('/employees/:id/employments', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrService.createEmployment(parseId(req.params.id), req.body as HrEmploymentWritePayload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create employment');
  }
});

router.put('/employments/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrService.updateEmployment(parseId(req.params.id), req.body as HrEmploymentWritePayload);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update employment');
  }
});

router.delete('/employments/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    await hrService.deleteEmployment(parseId(req.params.id));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete employment');
  }
});

router.post('/employments/:id/pay-terms', authenticateToken, managePayTerms, async (req: Request, res: Response) => {
  try {
    const data = await hrService.createPayTerms(parseId(req.params.id), req.body as HrPayTermsWritePayload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create pay terms');
  }
});

router.put('/pay-terms/:id', authenticateToken, managePayTerms, async (req: Request, res: Response) => {
  try {
    const data = await hrService.updatePayTerms(parseId(req.params.id), req.body as HrPayTermsWritePayload);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update pay terms');
  }
});

router.delete('/pay-terms/:id', authenticateToken, managePayTerms, async (req: Request, res: Response) => {
  try {
    await hrService.deletePayTerms(parseId(req.params.id));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete pay terms');
  }
});

router.post(
  '/import/preview',
  authenticateToken,
  manageEmployees,
  xlsxUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) throw new HrError('Файл не завантажено. Поле: file');
      const data = hrXlsxImportService.preview(req.file.buffer);
      res.json({ success: true, data });
    } catch (error) {
      sendHrError(res, error, 'import preview');
    }
  },
);

router.post(
  '/import/commit',
  authenticateToken,
  manageEmployees,
  editTimesheet,
  xlsxUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) throw new HrError('Файл не завантажено. Поле: file');
      const { roleService } = await import('../../services/RoleService.js');
      const importPayTerms = req.user?.role
        ? await roleService.hasPermission(req.user.role, PERMISSIONS.ACTION_HR_PAYTERMS_MANAGE)
        : false;
      const data = await hrXlsxImportService.commit(req.file.buffer, { importPayTerms });
      logServer(`[hr-import] committed entries=${data.upsertedEntries} employees=+${data.createdEmployees}`);
      res.json({ success: true, data });
    } catch (error) {
      sendHrError(res, error, 'import commit');
    }
  },
);

router.get('/timesheet', authenticateToken, pageTimesheet, async (req: Request, res: Response) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const data = await hrTimesheetService.loadMonth(month, req.user?.userId);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'load timesheet');
  }
});

router.put('/timesheet/:id', authenticateToken, editTimesheet, async (req: Request, res: Response) => {
  try {
    const body = req.body as HrTimesheetSavePayload;
    const data = await hrTimesheetService.saveMonth(parseId(req.params.id), body, req.user?.userId);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'save timesheet');
  }
});

router.get('/payroll', authenticateToken, pagePayroll, async (req: Request, res: Response) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const revealCard = await resolveRevealCard(req);
    const data = await hrPayrollService.loadMonth(month, revealCard);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'load payroll');
  }
});

router.post('/payroll/calculate', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const month = typeof req.body?.month === 'string' ? req.body.month : undefined;
    const version = req.body?.version != null ? Number(req.body.version) : undefined;
    const revealCard = await resolveRevealCard(req);
    const data = await hrPayrollService.calculate(month, version, revealCard);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'calculate payroll');
  }
});

router.put('/payroll/formula', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const body = req.body as HrPayrollFormulaUpdatePayload;
    const revealCard = await resolveRevealCard(req);
    const data = await hrPayrollService.updateFormula(
      body.month,
      body.extraRate,
      body.grossDivisor,
      body.version != null ? Number(body.version) : undefined,
      revealCard,
    );
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update payroll formula');
  }
});

router.post('/payroll/:id/lock', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const version = Number(req.body?.version);
    const revealCard = await resolveRevealCard(req);
    const data = await hrPayrollService.lock(parseId(req.params.id), version, req.user?.userId, revealCard);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'lock payroll');
  }
});

router.post('/payroll/:id/payouts', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const data = await hrPayrollService.addPayout(parseId(req.params.id), req.body as HrPayoutWritePayload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'add payout');
  }
});

router.put('/payouts/:id', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const data = await hrPayrollService.updatePayout(parseId(req.params.id), req.body as HrPayoutWritePayload);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update payout');
  }
});

router.delete('/payouts/:id', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    await hrPayrollService.deletePayout(parseId(req.params.id));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete payout');
  }
});

export default router;
