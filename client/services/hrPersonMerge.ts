import type { HrPersonDto, HrPersonMergeFieldSelections } from '@shared/types/hr';

export async function mergeHrPersonsBatch(
  targetPersonId: number,
  sourcePersonIds: number[],
  fieldSelections: HrPersonMergeFieldSelections,
): Promise<HrPersonDto> {
  const response = await fetch('/api/hr/persons/merge-batch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetPersonId,
      sourcePersonIds,
      fieldSelections,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Не вдалося обʼєднати особи');
  }
  return data.data as HrPersonDto;
}
