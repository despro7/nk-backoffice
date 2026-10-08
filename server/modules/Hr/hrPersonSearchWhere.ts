import type { Prisma } from '@prisma/client';

/** WHERE для пошуку фіз. осіб у довіднику (ПІБ, ІПН, телефон). */
export function buildPersonSearchWhere(search: string): Prisma.HrPersonWhereInput | undefined {
  const trimmed = search.trim();
  if (!trimmed) return undefined;

  const phoneDigits = trimmed.replace(/\D/g, '');
  const tokens = trimmed.split(/\s+/).filter((token) => token.length >= 2);
  const orConditions: Prisma.HrPersonWhereInput[] = [
    { displayName: { contains: trimmed } },
    { taxCode: { contains: trimmed } },
  ];

  if (phoneDigits.length >= 3) {
    orConditions.push({ phone: { contains: phoneDigits } });
  }

  if (tokens.length >= 2) {
    orConditions.push({
      AND: tokens.slice(0, 2).map((token) => ({ displayName: { contains: token } })),
    });
  }
  if (tokens.length > 2) {
    orConditions.push({
      AND: tokens.map((token) => ({ displayName: { contains: token } })),
    });
  }

  return { OR: orConditions };
}
