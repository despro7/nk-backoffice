import { prisma, logServer } from '../../lib/utils.js';
import { dilovodService } from '../../services/dilovod/DilovodService.js';
import { hrAuditService } from './HrAuditService.js';
import { hrPayGroupService } from './HrPayGroupService.js';
import { HrError } from './HrService.js';

function resolveDilovodName(name: unknown): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  if (typeof name === 'object' && name !== null) {
    const obj = name as { uk?: string; ru?: string };
    return obj.uk || obj.ru || '';
  }
  return String(name);
}

function parseDateOnly(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return new Date(`${raw}T00:00:00.000Z`);
}

function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class HrDilovodSyncService {
  async syncFirms(userId?: number): Promise<{ matched: number; created: number }> {
    const api = dilovodService.getApiClient();
    const firms = await api.getFirms();
    let matched = 0;
    let created = 0;

    for (const firm of firms) {
      const dilovodFirmId = String(firm.id ?? '');
      const name = resolveDilovodName(firm.name);
      if (!dilovodFirmId || !name) continue;

      const byDilovod = await prisma.hrLegalEntity.findFirst({ where: { dilovodFirmId } });
      if (byDilovod) {
        await prisma.hrLegalEntity.update({
          where: { id: byDilovod.id },
          data: { name },
        });
        matched += 1;
        continue;
      }

      const byName = await prisma.hrLegalEntity.findFirst({
        where: { name: { contains: name.slice(0, 32) } },
      });
      if (byName) {
        await prisma.hrLegalEntity.update({
          where: { id: byName.id },
          data: { dilovodFirmId, name },
        });
        matched += 1;
        continue;
      }

      const code = `firm_${dilovodFirmId.slice(-8)}`;
      await prisma.hrLegalEntity.create({
        data: {
          code,
          name,
          kind: name.toLowerCase().includes('тов') ? 'tov' : 'fop',
          dilovodFirmId,
          isActive: true,
        },
      });
      created += 1;
    }

    await hrAuditService.log({
      entityType: 'legal_entity',
      entityId: 0,
      action: 'sync_pull',
      userId,
      payload: { matched, created, total: firms.length },
    });
    logServer('[hr] firms sync', { matched, created });
    return { matched, created };
  }

  async syncEmployees(userId?: number): Promise<{ updated: number; created: number; unmatched: number; total: number }> {
    const api = dilovodService.getApiClient();
    const rows = await api.getEmployees();
    let updated = 0;
    let created = 0;
    let unmatched = 0;
    const payGroupId = await hrPayGroupService.resolveId('official_salary');
    const validFrom = todayUtcDate();

    for (const row of rows) {
      const dilovodEmployeeId = String(row.id ?? '');
      if (!dilovodEmployeeId) continue;

      const personnelNumber = row.code ? String(row.code) : null;

      const existingByDilovod = await prisma.hrEmployment.findFirst({
        where: { dilovodEmployeeId },
      });

      if (existingByDilovod) {
        await prisma.hrEmployment.update({
          where: { id: existingByDilovod.id },
          data: {
            personnelNumber: personnelNumber ?? existingByDilovod.personnelNumber,
          },
        });
        await hrAuditService.log({
          entityType: 'employment',
          entityId: existingByDilovod.id,
          action: 'employment_synced',
          userId,
          payload: { dilovodEmployeeId, personnelNumber, mode: 'update' },
        });
        updated += 1;
        continue;
      }

      const dilovodPersonId = row.person ? String(row.person) : '';
      const dilovodFirmId = row.firm ? String(row.firm) : '';
      if (!dilovodPersonId || !dilovodFirmId) {
        unmatched += 1;
        continue;
      }

      const person = await prisma.hrPerson.findFirst({ where: { dilovodPersonId } });
      const legalEntity = await prisma.hrLegalEntity.findFirst({ where: { dilovodFirmId } });
      if (!person || !legalEntity) {
        unmatched += 1;
        continue;
      }

      const employee = await prisma.hrEmployee.findFirst({
        where: { personId: person.id, deletedAt: null },
      });
      if (!employee) {
        unmatched += 1;
        continue;
      }

      const existingByPair = await prisma.hrEmployment.findFirst({
        where: { employeeId: employee.id, legalEntityId: legalEntity.id },
        orderBy: { validFrom: 'desc' },
      });

      if (existingByPair) {
        await prisma.hrEmployment.update({
          where: { id: existingByPair.id },
          data: {
            dilovodEmployeeId,
            personnelNumber: personnelNumber ?? existingByPair.personnelNumber,
          },
        });
        await hrAuditService.log({
          entityType: 'employment',
          entityId: existingByPair.id,
          action: 'employment_synced',
          userId,
          payload: { dilovodEmployeeId, personnelNumber, mode: 'link' },
        });
        updated += 1;
      } else {
        const newEmployment = await prisma.hrEmployment.create({
          data: {
            employeeId: employee.id,
            legalEntityId: legalEntity.id,
            payGroupId,
            validFrom,
            dilovodEmployeeId,
            personnelNumber,
          },
        });
        await hrAuditService.log({
          entityType: 'employment',
          entityId: newEmployment.id,
          action: 'employment_synced',
          userId,
          payload: { dilovodEmployeeId, personnelNumber, mode: 'create' },
        });
        created += 1;
      }
    }

    await hrAuditService.log({
      entityType: 'employment',
      entityId: 0,
      action: 'sync_pull',
      userId,
      payload: { updated, created, unmatched, total: rows.length },
    });
    logServer('[hr] employees sync', { updated, created, unmatched, total: rows.length });
    return { updated, created, unmatched, total: rows.length };
  }

  async pullPersonnelNumber(employmentId: number): Promise<{ remoteCode: string | null }> {
    const employment = await prisma.hrEmployment.findUnique({ where: { id: employmentId } });
    if (!employment) throw new HrError('Зайнятість не знайдено', 404);
    if (!employment.dilovodEmployeeId) {
      throw new HrError('Зайнятість не прив\'язана до Dilovod');
    }

    const api = dilovodService.getApiClient();
    const rows = await api.getEmployees([
      { alias: 'id', operator: '=', value: employment.dilovodEmployeeId },
    ]);
    const row = rows[0];
    const remoteCode = row?.code ? String(row.code) : null;
    return { remoteCode };
  }

  async pushPersonnelNumber(employmentId: number, userId?: number): Promise<void> {
    const employment = await prisma.hrEmployment.findUnique({
      where: { id: employmentId },
      include: { employee: true },
    });
    if (!employment) throw new HrError('Зайнятість не знайдено', 404);
    if (!employment.dilovodEmployeeId) {
      throw new HrError('Зайнятість не прив\'язана до Dilovod');
    }
    if (!employment.personnelNumber) {
      throw new HrError('Табельний номер не вказано');
    }

    const api = dilovodService.getApiClient();
    await api.updateEmployee({
      id: employment.dilovodEmployeeId,
      code: employment.personnelNumber,
    });

    await hrAuditService.log({
      entityType: 'employment',
      entityId: employmentId,
      action: 'sync_push',
      userId,
      payload: { personnelNumber: employment.personnelNumber },
    });
  }

  async syncStaffOrders(userId?: number): Promise<{ upserted: number }> {
    const api = dilovodService.getApiClient();
    let upserted = 0;

    try {
      const rows = await api.getStaffOrders();
      for (const row of rows) {
        const dilovodDocId = String(row.id ?? '');
        const employeeRef = row.employee ? String(row.employee) : '';
        if (!dilovodDocId || !employeeRef) continue;

        const employment = await prisma.hrEmployment.findFirst({
          where: { dilovodEmployeeId: employeeRef },
        });
        if (!employment) continue;

        const orderDate = parseDateOnly(row.date);
        if (!orderDate) continue;

        const data = {
          employmentId: employment.id,
          kind: 'official',
          position: row.position ? String(row.position) : null,
          orderDate,
          orderNumber: row.number ? String(row.number) : null,
          hireDate: parseDateOnly(row.hireDate),
          dismissDate: parseDateOnly(row.dismissDate),
          dilovodDocId,
        };

        await prisma.hrStaffOrder.upsert({
          where: { dilovodDocId },
          create: data,
          update: data,
        });
        upserted += 1;
      }
    } catch (error) {
      logServer('[hr] staff orders sync failed', error instanceof Error ? error.message : error);
      throw error;
    }

    await hrAuditService.log({
      entityType: 'employment',
      entityId: 0,
      action: 'sync_pull',
      userId,
      payload: { upserted, source: 'staffOrder' },
    });
    return { upserted };
  }
}

export const hrDilovodSyncService = new HrDilovodSyncService();
