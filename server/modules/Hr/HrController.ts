import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  requirePermission,
  requirePermissionKey,
  requireAnyPermissionKey,
  sendInsufficientRole,
} from '../../middleware/requirePermission.js';
import { logServer } from '../../lib/utils.js';
import { PERMISSIONS } from '../../../shared/constants/permissions.js';
import { hrService, HrError } from './HrService.js';
import { hrTimesheetService } from './HrTimesheetService.js';
import { hrPayrollService } from './HrPayrollService.js';
import { hrAuditService } from './HrAuditService.js';
import { hrPayGroupService } from './HrPayGroupService.js';
import { hrPersonService } from './HrPersonService.js';
import { hrPersonSyncService } from './HrPersonSyncService.js';
import { hrPersonGroupSyncService } from './HrPersonGroupSyncService.js';
import { hrDilovodSyncService } from './HrDilovodSyncService.js';
import { hrTaxRuleService } from './HrTaxRuleService.js';
import { hrProductionCalendarService } from './HrProductionCalendarService.js';
import { hrBonusService } from './HrBonusService.js';
import { hrFopService } from './HrFopService.js';
import {
  HR_PERSON_MERGE_PICKABLE_FIELDS,
  type HrAuditEntityType,
  type HrBonusWritePayload,
  type HrEmployeeWritePayload,
  type HrEmploymentWritePayload,
  type HrLegalEntityWritePayload,
  type HrLegalEntityDeletePayload,
  type HrPayGroupWritePayload,
  type HrPayrollFormulaUpdatePayload,
  type HrPayrollPeriodOptions,
  type HrPayTermsWritePayload,
  type HrPayoutWritePayload,
  type HrPersonMergeFieldSelections,
  type HrPersonWritePayload,
  type HrProductionCalendarWritePayload,
  type HrTaxRuleWritePayload,
  type HrTimesheetSavePayload,
  type HrTimesheetEditorMode,
} from '../../../shared/types/hr.js';

const router = Router();

const pageEmployees = requirePermissionKey(PERMISSIONS.PAGE_HR_EMPLOYEES);
const pagePersons = requirePermissionKey(PERMISSIONS.PAGE_HR_PERSONS);

/** Пошук фіз. осіб для привʼязки до співробітника — без окремого доступу до сторінки «Фіз. особи». */
async function allowPersonListOrEmployeePersonSearch(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (!search) {
    pagePersons(req, res, next);
    return;
  }
  if (!req.user) {
    res.status(401).json({
      message: 'Authentication required',
      code: 'NO_AUTH',
      details: 'You need to be authenticated to access this resource',
    });
    return;
  }
  if (req.user.userId === 0) {
    next();
    return;
  }
  const { roleService } = await import('../../services/RoleService.js');
  const allowed =
    await roleService.hasPermission(req.user.role, PERMISSIONS.PAGE_HR_PERSONS)
    || await roleService.hasPermission(req.user.role, PERMISSIONS.PAGE_HR_EMPLOYEES);
  if (!allowed) {
    sendInsufficientRole(res, 'Потрібен доступ до сторінки «Співробітники» або «Фіз. особи»');
    return;
  }
  next();
}
const pageTimesheet = requirePermissionKey(PERMISSIONS.PAGE_HR_TIMESHEET);
const manageEmployees = requirePermission('hr', 'employees.manage', 'Керувати співробітниками');
const managePersons = requirePermission('hr', 'persons.manage', 'Керувати фізичними особами');
const managePayTerms = requirePermission('hr', 'payterms.manage', 'Керувати ставками співробітників');
const manageTaxRules = requirePermission('hr', 'taxrules.manage', 'Керувати податками та ЄСВ');
const manageBonuses = requirePermission('hr', 'bonuses.manage', 'Керувати преміями');
requirePermission('hr', 'timesheet.edit', 'Редагувати табель');
requirePermission(
  'hr',
  'timesheet.edit-own-today',
  'Редагувати табель (свої записи за сьогодні, усі співробітники)',
);
const hrPayGroupsRead = requireAnyPermissionKey([
  PERMISSIONS.PAGE_HR_EMPLOYEES,
  PERMISSIONS.PAGE_HR_TIMESHEET,
  PERMISSIONS.PAGE_HR_PAYROLL,
]);
const viewAudit = requirePermissionKey(PERMISSIONS.ACTION_HR_AUDIT_VIEW);
const pagePayroll = requirePermissionKey(PERMISSIONS.PAGE_HR_PAYROLL);
const viewPayroll = requirePermission('hr', 'payroll.view', 'Переглядати внутрішній розрахунок виплат');
requirePermission('hr', 'payouts.view', 'Бачити повний номер картки');

function parseId(raw: string | string[] | undefined): number {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw new HrError('Некоректний ідентифікатор');
  return id;
}

function userId(req: Request): number | undefined {
  const id = req.user?.userId;
  return id && id > 0 ? id : undefined;
}

function parsePersonMergeFieldSelections(raw: unknown): HrPersonMergeFieldSelections | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const selections = {} as HrPersonMergeFieldSelections;
  for (const field of HR_PERSON_MERGE_PICKABLE_FIELDS) {
    const value = Number(source[field]);
    if (!Number.isInteger(value) || value <= 0) return undefined;
    selections[field] = value;
  }
  return selections;
}

function parsePayrollPeriodOptions(source: {
  periodMode?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
}): HrPayrollPeriodOptions {
  return {
    periodMode: typeof source.periodMode === 'string' ? source.periodMode : undefined,
    dateFrom: typeof source.dateFrom === 'string' ? source.dateFrom : undefined,
    dateTo: typeof source.dateTo === 'string' ? source.dateTo : undefined,
  };
}

async function resolveRevealCard(req: Request): Promise<boolean> {
  const { roleService } = await import('../../services/RoleService.js');
  if (!req.user?.role) return false;
  return roleService.hasPermission(req.user.role, PERMISSIONS.ACTION_HR_PAYOUTS_VIEW);
}

async function resolveTimesheetEditMode(req: Request): Promise<HrTimesheetEditorMode | null> {
  const { roleService } = await import('../../services/RoleService.js');
  if (!req.user?.role) return null;
  if (await roleService.hasPermission(req.user.role, PERMISSIONS.ACTION_HR_TIMESHEET_EDIT)) {
    return 'full';
  }
  if (await roleService.hasPermission(req.user.role, PERMISSIONS.ACTION_HR_TIMESHEET_EDIT_OWN_TODAY)) {
    return 'author-today';
  }
  return null;
}

async function allowTimesheetEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      message: 'Authentication required',
      code: 'NO_AUTH',
      details: 'You need to be authenticated to access this resource',
    });
    return;
  }
  if (req.user.userId === 0) {
    next();
    return;
  }
  const mode = await resolveTimesheetEditMode(req);
  if (!mode) {
    sendInsufficientRole(res, 'Потрібне право на редагування табеля');
    return;
  }
  req.timesheetEditMode = mode;
  next();
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

router.get('/audit', authenticateToken, viewAudit, async (req: Request, res: Response) => {
  try {
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType as HrAuditEntityType : undefined;
    const entityId = req.query.entityId != null ? Number(req.query.entityId) : undefined;
    const employmentId = req.query.employmentId != null ? Number(req.query.employmentId) : undefined;
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const data = await hrAuditService.list({ entityType, entityId, employmentId, date, limit });
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'audit list');
  }
});

router.get('/pay-groups', authenticateToken, hrPayGroupsRead, async (req: Request, res: Response) => {
  try {
    const data = await hrPayGroupService.list(req.query.includeInactive === 'true');
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'pay-groups');
  }
});

router.post('/pay-groups', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrPayGroupService.create(req.body as HrPayGroupWritePayload, userId(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create pay-group');
  }
});

router.put('/pay-groups/reorder', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
      : [];
    const data = await hrPayGroupService.reorder(ids, userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'reorder pay-groups');
  }
});

router.patch('/pay-groups/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrPayGroupService.update(parseId(req.params.id), req.body as HrPayGroupWritePayload, userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update pay-group');
  }
});

router.delete('/pay-groups/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    await hrPayGroupService.deactivate(parseId(req.params.id), userId(req));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete pay-group');
  }
});

	router.get('/persons/tree', authenticateToken, pagePersons, async (req: Request, res: Response) => {
	  try {
	    const data = await hrPersonService.getTree({
	      search: typeof req.query.search === 'string' ? req.query.search : undefined,
	      duplicatesOnly: req.query.duplicates === 'true',
	    });
	    res.json({ success: true, data });
	  } catch (error) {
	    sendHrError(res, error, 'persons tree');
	  }
	});

	router.get('/persons', authenticateToken, allowPersonListOrEmployeePersonSearch, async (req: Request, res: Response) => {
	  try {
	    const data = await hrPersonService.list({
	      search: typeof req.query.search === 'string' ? req.query.search : undefined,
	      employeesGroupOnly: req.query.group === 'employees',
	      outOfGroup: req.query.group === 'out',
	      duplicatesOnly: req.query.duplicates === 'true',
	    });
	    res.json({ success: true, data });
	  } catch (error) {
	    sendHrError(res, error, 'list persons');
	  }
	});

router.get('/persons/:id', authenticateToken, pagePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonService.getById(parseId(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'get person');
  }
});

router.get('/persons/:id/duplicates', authenticateToken, pagePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonService.findDuplicates(parseId(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'person duplicates');
  }
});

router.get('/persons/:id/merged', authenticateToken, pagePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonService.findMerged(parseId(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'person merged');
  }
});

router.post('/persons', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonService.create(req.body as HrPersonWritePayload, userId(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create person');
  }
});

router.put('/persons/:id', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonService.update(parseId(req.params.id), req.body as HrPersonWritePayload, userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update person');
  }
});

router.post('/persons/:id/merge', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const targetPersonId = Number(req.body?.targetPersonId);
    if (!Number.isInteger(targetPersonId) || targetPersonId <= 0) {
      throw new HrError('Вкажіть targetPersonId');
    }
    const sourceId = parseId(req.params.id);
    const fieldSelections = parsePersonMergeFieldSelections(req.body?.fieldSelections);
    const data = await hrPersonService.mergePersonsBatch(
      targetPersonId,
      [sourceId],
      fieldSelections,
      userId(req),
    );
    const synced = await hrPersonSyncService.finalizeMergedPersonSources([sourceId], targetPersonId, userId(req));
    res.json({ success: true, data: synced });
  } catch (error) {
    sendHrError(res, error, 'merge person');
  }
});

router.post('/persons/merge-batch', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const targetPersonId = Number(req.body?.targetPersonId);
    if (!Number.isInteger(targetPersonId) || targetPersonId <= 0) {
      throw new HrError('Вкажіть targetPersonId');
    }
    const sourcePersonIds = Array.isArray(req.body?.sourcePersonIds)
      ? req.body.sourcePersonIds.map((value: unknown) => Number(value)).filter((id: number) => Number.isInteger(id) && id > 0)
      : [];
    const fieldSelections = parsePersonMergeFieldSelections(req.body?.fieldSelections);
    if (!fieldSelections) {
      throw new HrError('Вкажіть fieldSelections');
    }
    await hrPersonService.mergePersonsBatch(targetPersonId, sourcePersonIds, fieldSelections, userId(req));
    const synced = await hrPersonSyncService.finalizeMergedPersonSources(sourcePersonIds, targetPersonId, userId(req));
    res.json({ success: true, data: synced });
  } catch (error) {
    sendHrError(res, error, 'merge persons batch');
  }
});

router.post('/persons/sync/pull', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonSyncService.pullSelective();
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'persons sync pull');
  }
});

router.post('/persons/sync/pull/contacts', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonSyncService.pullContactsFromDilovod();
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'persons sync pull contacts');
  }
});

router.post('/persons/sync/pull/groups', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonSyncService.pullGroupsFromDilovod();
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'persons sync pull groups');
  }
});

router.post('/persons/:id/sync/push', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonSyncService.pushPerson(parseId(req.params.id), userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'person sync push');
  }
});

router.post('/persons/:id/sync/pull', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonSyncService.pullPerson(parseId(req.params.id), userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'person sync pull');
  }
});

router.post('/persons/:id/sync/record', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonSyncService.syncPersonRecord(parseId(req.params.id), userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'person sync record');
  }
});

	router.post('/persons/:id/move-to-employees', authenticateToken, managePersons, async (req: Request, res: Response) => {
	  try {
	    const data = await hrPersonSyncService.moveToEmployeesGroup(parseId(req.params.id), userId(req));
	    res.json({ success: true, data });
	  } catch (error) {
	    sendHrError(res, error, 'move person to employees group');
	  }
	});

	router.post('/persons/:id/move-to-group', authenticateToken, managePersons, async (req: Request, res: Response) => {
	  try {
	    const targetGroupId = typeof req.body?.targetGroupId === 'string' ? req.body.targetGroupId.trim() : '';
	    if (!targetGroupId) throw new HrError('Вкажіть targetGroupId');
	    const data = await hrPersonSyncService.moveToGroup(parseId(req.params.id), targetGroupId, userId(req));
	    res.json({ success: true, data });
	  } catch (error) {
	    sendHrError(res, error, 'move person to group');
	  }
	});

	router.post('/persons/:id/align-group-with-employer', authenticateToken, managePersons, async (req: Request, res: Response) => {
	  try {
	    const data = await hrPersonSyncService.alignPersonGroupWithEmployer(parseId(req.params.id), userId(req));
	    res.json({ success: true, data });
	  } catch (error) {
	    sendHrError(res, error, 'align person group with employer');
	  }
	});

	router.post('/persons/:id/dismiss', authenticateToken, managePersons, async (req: Request, res: Response) => {
	  try {
	    const dismissedAt = typeof req.body?.dismissedAt === 'string' ? req.body.dismissedAt : '';
	    if (!dismissedAt) throw new HrError('Вкажіть дату звільнення');
	    const data = await hrPersonSyncService.dismissPerson(parseId(req.params.id), dismissedAt, userId(req));
	    res.json({ success: true, data });
	  } catch (error) {
	    sendHrError(res, error, 'dismiss person');
	  }
	});

router.post('/sync/firms', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrDilovodSyncService.syncFirms(userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'sync firms');
  }
});

router.post('/sync/employees', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrDilovodSyncService.syncEmployees(userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'sync employees');
  }
});

router.post('/sync/staff-orders', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrDilovodSyncService.syncStaffOrders(userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'sync staff orders');
  }
});

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
    const data = await hrService.createLegalEntity(req.body as HrLegalEntityWritePayload, userId(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create legal entity');
  }
});

router.post('/legal-entities/:id/sync/person-group', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const data = await hrPersonGroupSyncService.syncEmployerPersonGroup(parseId(req.params.id), userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'sync employer person group');
  }
});

router.delete('/legal-entities/:id/person-group', authenticateToken, managePersons, async (req: Request, res: Response) => {
  try {
    const localOnly = req.query.localOnly === '1' || req.query.localOnly === 'true';
    await hrPersonGroupSyncService.deleteEmptyEmployerPersonGroup(parseId(req.params.id), userId(req), { localOnly });
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete employer person group');
  }
});

router.put('/legal-entities/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrService.updateLegalEntity(parseId(req.params.id), req.body as HrLegalEntityWritePayload, userId(req));
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
    await hrService.deleteLegalEntity(parseId(req.params.id), targetLegalEntityId, userId(req));
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

router.get('/employees/employer-counts', authenticateToken, pageEmployees, async (_req: Request, res: Response) => {
  try {
    const data = await hrService.getEmployerEmployeeCounts();
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'employer employee counts');
  }
});

router.get('/employees', authenticateToken, pageEmployees, async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const archived = req.query.archived === 'true';
    const legalEntityIdRaw = req.query.legalEntityId;
    const legalEntityId =
      typeof legalEntityIdRaw === 'string' && legalEntityIdRaw.trim()
        ? parseId(legalEntityIdRaw)
        : undefined;
    const data = archived
      ? await hrService.listArchivedEmployees(search)
      : await hrService.listEmployees(search, req.query.includeInactive !== 'false', legalEntityId);
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
    const data = await hrService.createEmployee(req.body as HrEmployeeWritePayload, revealCard, userId(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create employee');
  }
});

router.put('/employees/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const revealCard = await resolveRevealCard(req);
    const data = await hrService.updateEmployee(parseId(req.params.id), req.body as HrEmployeeWritePayload, revealCard, userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update employee');
  }
});

router.delete('/employees/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    await hrService.deleteEmployee(parseId(req.params.id), userId(req));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete employee');
  }
});

router.post('/employees/:id/restore', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrService.restoreEmployee(parseId(req.params.id), userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'restore employee');
  }
});

router.post('/employees/:id/employments', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrService.createEmployment(parseId(req.params.id), req.body as HrEmploymentWritePayload, userId(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create employment');
  }
});

router.put('/employments/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrService.updateEmployment(parseId(req.params.id), req.body as HrEmploymentWritePayload, userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update employment');
  }
});

router.delete('/employments/:id', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    await hrService.deleteEmployment(parseId(req.params.id), userId(req));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete employment');
  }
});

const transferEmployment = requirePermissionKey(PERMISSIONS.ACTION_HR_EMPLOYMENT_TRANSFER);
const changeEmploymentGroup = requirePermission(
  'hr',
  'employment.change-group',
  'Змінювати групу оплати зайнятості',
);
const changeEmploymentEmployer = requirePermission(
  'hr',
  'employment.change-employer',
  'Змінювати роботодавця зайнятості',
);
const changeEmploymentPayRate = requirePermission(
  'hr',
  'employment.change-pay-rate',
  'Змінювати ставку',
);

router.post('/employments/:id/transfer-and-delete', authenticateToken, transferEmployment, async (req: Request, res: Response) => {
  try {
    const targetEmploymentId = Number(req.body?.targetEmploymentId);
    if (!Number.isInteger(targetEmploymentId) || targetEmploymentId <= 0) {
      throw new HrError('Вкажіть targetEmploymentId');
    }
    await hrService.transferAndDeleteEmployment(parseId(req.params.id), targetEmploymentId, userId(req));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'transfer and delete employment');
  }
});

router.patch('/employments/:id/pay-group', authenticateToken, changeEmploymentGroup, async (req: Request, res: Response) => {
  try {
    const payGroup = typeof req.body?.payGroup === 'string' ? req.body.payGroup : '';
    const data = await hrService.changeEmploymentPayGroup(parseId(req.params.id), payGroup as import('../../../shared/types/hr.js').HrPayGroup, userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'change employment pay group');
  }
});

router.patch('/employments/:id/employer', authenticateToken, changeEmploymentEmployer, async (req: Request, res: Response) => {
  try {
    const legalEntityId = Number(req.body?.legalEntityId);
    if (!Number.isInteger(legalEntityId) || legalEntityId <= 0) {
      throw new HrError('Вкажіть legalEntityId');
    }
    const data = await hrService.changeEmploymentLegalEntity(parseId(req.params.id), legalEntityId, userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'change employment employer');
  }
});

router.post('/employments/:id/merge', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const targetEmploymentId = Number(req.body?.targetEmploymentId);
    if (!Number.isInteger(targetEmploymentId) || targetEmploymentId <= 0) {
      throw new HrError('Вкажіть targetEmploymentId');
    }
    await hrService.mergeEmployment(parseId(req.params.id), targetEmploymentId, userId(req));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'merge employment');
  }
});

router.get('/employments/:id/dilovod-personnel-number', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrDilovodSyncService.pullPersonnelNumber(parseId(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'pull dilovod personnel number');
  }
});

router.post('/employments/:id/sync/push-personnel-number', authenticateToken, manageEmployees, async (req: Request, res: Response) => {
  try {
    await hrDilovodSyncService.pushPersonnelNumber(parseId(req.params.id), userId(req));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'push personnel number');
  }
});

router.post('/employments/:id/pay-terms', authenticateToken, changeEmploymentPayRate, async (req: Request, res: Response) => {
  try {
    const data = await hrService.createPayTerms(parseId(req.params.id), req.body as HrPayTermsWritePayload, userId(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create pay terms');
  }
});

router.put('/pay-terms/:id', authenticateToken, changeEmploymentPayRate, async (req: Request, res: Response) => {
  try {
    const data = await hrService.updatePayTerms(parseId(req.params.id), req.body as HrPayTermsWritePayload, userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update pay terms');
  }
});

router.delete('/pay-terms/:id', authenticateToken, managePayTerms, async (req: Request, res: Response) => {
  try {
    await hrService.deletePayTerms(parseId(req.params.id), userId(req));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete pay terms');
  }
});

router.get('/timesheet', authenticateToken, pageTimesheet, async (req: Request, res: Response) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const editMode = await resolveTimesheetEditMode(req);
    const data = await hrTimesheetService.loadMonth(month, userId(req), editMode);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'load timesheet');
  }
});

router.put('/timesheet/:id', authenticateToken, allowTimesheetEdit, async (req: Request, res: Response) => {
  try {
    const body = req.body as HrTimesheetSavePayload;
    const data = await hrTimesheetService.saveMonth(
      parseId(req.params.id),
      body,
      userId(req),
      req.timesheetEditMode ?? 'full',
    );
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'save timesheet');
  }
});

router.get('/payroll', authenticateToken, pagePayroll, async (req: Request, res: Response) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const periodOptions = parsePayrollPeriodOptions(req.query);
    const revealCard = await resolveRevealCard(req);
    const data = await hrPayrollService.loadMonth(month, revealCard, periodOptions);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'load payroll');
  }
});

router.post('/payroll/calculate', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const month = typeof req.body?.month === 'string' ? req.body.month : undefined;
    const version = req.body?.version != null ? Number(req.body.version) : undefined;
    const periodOptions = parsePayrollPeriodOptions(req.body ?? {});
    const revealCard = await resolveRevealCard(req);
    const data = await hrPayrollService.calculate(month, version, revealCard, periodOptions);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'calculate payroll');
  }
});

router.put('/payroll/formula', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const body = req.body as HrPayrollFormulaUpdatePayload;
    const periodOptions = parsePayrollPeriodOptions(body);
    const revealCard = await resolveRevealCard(req);
    const data = await hrPayrollService.updateFormula(
      body.month,
      body.extraRate,
      body.grossDivisor,
      body.version != null ? Number(body.version) : undefined,
      revealCard,
      periodOptions,
    );
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update payroll formula');
  }
});

router.post('/payroll/:id/lock', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const version = Number(req.body?.version);
    const periodOptions = parsePayrollPeriodOptions(req.body ?? {});
    const revealCard = await resolveRevealCard(req);
    const data = await hrPayrollService.lock(parseId(req.params.id), version, userId(req), revealCard, periodOptions);
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

router.get('/tax-rules', authenticateToken, pageEmployees, async (req: Request, res: Response) => {
  try {
    const data = await hrTaxRuleService.list(req.query.includeInactive === 'true');
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'tax-rules');
  }
});

router.post('/tax-rules', authenticateToken, manageTaxRules, async (req: Request, res: Response) => {
  try {
    const data = await hrTaxRuleService.create(req.body as HrTaxRuleWritePayload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create tax-rule');
  }
});

router.patch('/tax-rules/:id', authenticateToken, manageTaxRules, async (req: Request, res: Response) => {
  try {
    const data = await hrTaxRuleService.update(parseId(req.params.id), req.body as HrTaxRuleWritePayload);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update tax-rule');
  }
});

router.delete('/tax-rules/:id', authenticateToken, manageTaxRules, async (req: Request, res: Response) => {
  try {
    await hrTaxRuleService.deactivate(parseId(req.params.id));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete tax-rule');
  }
});

router.get('/production-calendar', authenticateToken, pageEmployees, async (_req: Request, res: Response) => {
  try {
    const data = await hrProductionCalendarService.get();
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'production-calendar');
  }
});

router.put('/production-calendar', authenticateToken, manageTaxRules, async (req: Request, res: Response) => {
  try {
    const data = await hrProductionCalendarService.update(req.body as HrProductionCalendarWritePayload);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update production-calendar');
  }
});

router.get('/production-weeks', authenticateToken, pageEmployees, async (req: Request, res: Response) => {
  try {
    const year = req.query.year != null ? Number(req.query.year) : new Date().getFullYear();
    const month = req.query.month != null ? Number(req.query.month) : undefined;
    const data = await hrProductionCalendarService.listWeeks(year, month);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'production-weeks');
  }
});

router.get('/bonuses/employments', authenticateToken, pageEmployees, async (_req: Request, res: Response) => {
  try {
    const data = await hrBonusService.listEmploymentOptions();
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'bonus employments');
  }
});

router.get('/bonuses', authenticateToken, pageEmployees, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const data = await hrBonusService.list({
      year: req.query.year != null ? Number(req.query.year) : now.getFullYear(),
      month: req.query.month != null ? Number(req.query.month) : now.getMonth() + 1,
      employmentId: req.query.employmentId != null ? Number(req.query.employmentId) : undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'bonuses');
  }
});

router.post('/bonuses', authenticateToken, manageBonuses, async (req: Request, res: Response) => {
  try {
    const data = await hrBonusService.create(req.body as HrBonusWritePayload, userId(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'create bonus');
  }
});

router.patch('/bonuses/:id', authenticateToken, manageBonuses, async (req: Request, res: Response) => {
  try {
    const data = await hrBonusService.update(parseId(req.params.id), req.body as HrBonusWritePayload, userId(req));
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'update bonus');
  }
});

router.delete('/bonuses/:id', authenticateToken, manageBonuses, async (req: Request, res: Response) => {
  try {
    await hrBonusService.delete(parseId(req.params.id), userId(req));
    res.json({ success: true });
  } catch (error) {
    sendHrError(res, error, 'delete bonus');
  }
});

router.get('/fop', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const periodId = typeof req.query.periodId === 'string' ? req.query.periodId : undefined;
    const periodKind = req.query.periodKind === 'production' ? 'production' : 'calendar';
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    if (!dateFrom && !periodId) throw new HrError('Вкажіть період');
    const data = await hrFopService.getSummary({
      dateFrom,
      dateTo,
      periodId,
      periodKind,
      month,
    });
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'fop summary');
  }
});

router.get('/fop/periods', authenticateToken, viewPayroll, async (req: Request, res: Response) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const data = await hrFopService.listPeriodOptions(month);
    res.json({ success: true, data });
  } catch (error) {
    sendHrError(res, error, 'fop periods');
  }
});

export default router;
