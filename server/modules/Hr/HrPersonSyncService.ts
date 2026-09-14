import { prisma, logServer } from '../../lib/utils.js';
import { DILOVOD_PERSON_GROUP_EMPLOYEES } from '../../../shared/constants/dilovod.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneNormalizer.js';
import { dilovodService } from '../../services/dilovod/DilovodService.js';
import { hrAuditService } from './HrAuditService.js';
import { hrPersonService } from './HrPersonService.js';
import type { HrPersonDto } from '../../../shared/types/hr.js';

interface DilovodPersonRow {
  id: string;
  code?: string;
  name?: string | { uk?: string; ru?: string };
  taxCode?: string;
  phone?: string;
  email?: string;
  address?: string;
  parent?: string;
  personType?: string;
  state?: string;
  delMark?: number | boolean;
  version?: string;
}

function resolveName(name: DilovodPersonRow['name']): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name.uk || name.ru || '';
}

function extractPhone(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const phones = (details as { phones?: Array<{ pr?: string }> }).phones;
  const raw = phones?.[0]?.pr;
  return raw ? normalizePhoneNumber(raw) : null;
}

function extractEmail(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const emails = (details as { emails?: Array<{ pr?: string }> }).emails;
  return emails?.[0]?.pr?.trim() || null;
}

function extractAddress(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const addresses = (details as { addresses?: Array<{ pr?: { uk?: string } | string }> }).addresses;
  const pr = addresses?.[0]?.pr;
  if (!pr) return null;
  if (typeof pr === 'string') return pr;
  return pr.uk || null;
}

export class HrPersonSyncService {
  async pullSelective(): Promise<{ pulled: number; updated: number }> {
    const api = dilovodService.getApiClient();
    let pulled = 0;
    let updated = 0;

    const linkedIds = new Set<string>();
    const employees = await prisma.hrEmployee.findMany({
      where: { person: { dilovodPersonId: { not: null } } },
      include: { person: true },
    });
    for (const emp of employees) {
      if (emp.person?.dilovodPersonId) linkedIds.add(emp.person.dilovodPersonId);
    }

    const dilovodRows: DilovodPersonRow[] = [];
    if (linkedIds.size > 0) {
      const byIds = await api.getPersonsByIds([...linkedIds]);
      dilovodRows.push(...byIds);
    }

    const groupRows = await api.getPersonsByParent(DILOVOD_PERSON_GROUP_EMPLOYEES);
    for (const row of groupRows) {
      if (!dilovodRows.some((r) => r.id === row.id)) dilovodRows.push(row);
    }

    const employeePersonIds = new Set<string>();
    const dilovodEmployees = await api.getEmployees();
    for (const row of dilovodEmployees) {
      if (row.person) employeePersonIds.add(String(row.person));
    }
    if (employeePersonIds.size > 0) {
      const employeePersonRows = await api.getPersonsByIds([...employeePersonIds]);
      for (const row of employeePersonRows) {
        if (!dilovodRows.some((r) => r.id === row.id)) dilovodRows.push(row);
      }
    }

    for (const row of dilovodRows) {
      const result = await this.upsertFromDilovod(row);
      if (result === 'created') pulled += 1;
      if (result === 'updated') updated += 1;
    }

    await hrPersonService.markDuplicateCandidates();
    logServer('[hr] persons selective pull', { pulled, updated, total: dilovodRows.length });
    return { pulled, updated };
  }

  async pushPerson(personId: number, userId?: number): Promise<HrPersonDto> {
    const person = await prisma.hrPerson.findUnique({ where: { id: personId } });
    if (!person) throw new Error('Person not found');

    const api = dilovodService.getApiClient();
    const payload = {
      id: person.dilovodPersonId,
      name: person.displayName,
      taxCode: person.taxCode,
      phone: person.phone,
      email: person.email,
      address: person.address,
      parent: person.dilovodParentId,
      state: person.dilovodStateId,
    };

    const saved = person.dilovodPersonId
      ? await api.updatePerson(payload)
      : await api.createPersonExtended(payload);

    const updated = await prisma.hrPerson.update({
      where: { id: personId },
      data: {
        dilovodPersonId: saved.id,
        dilovodCode: saved.code ?? person.dilovodCode,
        dilovodVersion: saved.version ?? person.dilovodVersion,
        lastSyncedAt: new Date(),
      },
    });

    await hrAuditService.log({
      entityType: 'person',
      entityId: personId,
      action: 'sync_push',
      userId,
    });

    return hrPersonService.getById(updated.id);
  }

  async moveToEmployeesGroup(personId: number, userId?: number): Promise<HrPersonDto> {
    const person = await prisma.hrPerson.findUnique({ where: { id: personId } });
    if (!person) throw new Error('Person not found');

    const api = dilovodService.getApiClient();
    await api.updatePerson({
      id: person.dilovodPersonId!,
      name: person.displayName,
      parent: DILOVOD_PERSON_GROUP_EMPLOYEES,
    });

    await prisma.hrPerson.update({
      where: { id: personId },
      data: { dilovodParentId: DILOVOD_PERSON_GROUP_EMPLOYEES, lastSyncedAt: new Date() },
    });

    await hrAuditService.log({
      entityType: 'person',
      entityId: personId,
      action: 'person.moved_to_employees_group',
      userId,
    });

    return hrPersonService.getById(personId);
  }

  private async upsertFromDilovod(row: DilovodPersonRow): Promise<'created' | 'updated' | 'skipped'> {
    const displayName = resolveName(row.name);
    if (!displayName) return 'skipped';

    let details: unknown;
    try {
      details = typeof row === 'object' && 'details' in row && typeof (row as { details?: string }).details === 'string'
        ? JSON.parse((row as { details: string }).details)
        : null;
    } catch {
      details = null;
    }

    const phone = row.phone ? normalizePhoneNumber(row.phone) : extractPhone(details);
    const email = row.email || extractEmail(details);
    const address = row.address || extractAddress(details);

    const data = {
      dilovodPersonId: row.id,
      dilovodCode: row.code ?? null,
      displayName,
      taxCode: row.taxCode ?? null,
      phone,
      email,
      address,
      dilovodParentId: row.parent ?? null,
      dilovodPersonTypeId: row.personType ?? null,
      dilovodStateId: row.state ?? null,
      isDeletedInDilovod: Boolean(row.delMark),
      dilovodVersion: row.version ?? null,
      lastSyncedAt: new Date(),
    };

    const existing = await prisma.hrPerson.findUnique({ where: { dilovodPersonId: row.id } });
    if (existing) {
      await prisma.hrPerson.update({ where: { id: existing.id }, data });
      return 'updated';
    }

    await prisma.hrPerson.create({ data });
    return 'created';
  }
}

export const hrPersonSyncService = new HrPersonSyncService();
