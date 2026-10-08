export type EmployerEmployeeCounts = Record<number, number> | Record<string, number>;

export function getEmployerEmployeeCount(counts: EmployerEmployeeCounts, employerId: number): number {
  const direct = counts[employerId];
  if (typeof direct === 'number') return direct;
  const keyed = counts[String(employerId)];
  return typeof keyed === 'number' ? keyed : 0;
}
