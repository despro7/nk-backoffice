/**
 * Звіт дублів зайнятостей (employee × payGroupId).
 * Запуск: npx tsx scripts/hr-audit-employment-duplicates.ts
 */
import { PrismaClient } from '@prisma/client';
import { dedupeEmploymentsByEmployeePayGroup } from '../shared/utils/hrEmploymentDedupe.js';

const prisma = new PrismaClient();

async function main() {
  const employments = await prisma.hrEmployment.findMany({
    include: {
      employee: { select: { id: true, displayName: true } },
      legalEntity: { select: { code: true, name: true } },
      payGroup: { select: { id: true, slug: true } },
    },
    orderBy: [{ employeeId: 'asc' }, { payGroupId: 'asc' }],
  });

  const mapped = employments.map((row) => ({
    id: row.id,
    payGroupId: row.payGroupId,
    payGroup: row.payGroup.slug,
    employee: { id: row.employee.id, displayName: row.employee.displayName },
    legalEntity: row.legalEntity,
  }));

  const { idRemap } = dedupeEmploymentsByEmployeePayGroup(
    mapped.map((row) => ({
      id: row.id,
      payGroupId: row.payGroupId,
      employee: { id: row.employee.id },
      legalEntity: row.legalEntity,
    })),
  );

  if (idRemap.size === 0) {
    console.log('Дублів зайнятостей не знайдено.');
    return;
  }

  console.log('employee_id,employee_name,duplicate_id,canonical_id,pay_group,legal_entity');
  for (const [dupId, canonicalId] of idRemap) {
    const dup = mapped.find((row) => row.id === dupId);
    const canonical = mapped.find((row) => row.id === canonicalId);
    if (!dup || !canonical) continue;
    console.log(
      [
        dup.employee.id,
        `"${dup.employee.displayName.replace(/"/g, '""')}"`,
        dupId,
        canonicalId,
        dup.payGroup,
        `"${dup.legalEntity.name.replace(/"/g, '""')}"`,
      ].join(','),
    );
  }
  console.log(`\nВсього дублів: ${idRemap.size}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
