import { getSpecColorByHue } from '@shared/utils/specColorPalette';
import type { HrPersonDto } from '@shared/types/hr';
import { HrSpecChip, hrStatusTokens } from '@/pages/Hr/hrUi';

const duplicateTokens = getSpecColorByHue('amber', 'light', 'soft');
const mergedTokens = getSpecColorByHue('blue', 'light', 'soft');

export function PersonStatusChip({ person }: { person: HrPersonDto }) {
  if (person.mergedCount > 0) {
    return (
      <HrSpecChip tokens={mergedTokens} icon="merge">
        Обʼєднано
        <span className="text-xs opacity-80">({person.mergedCount})</span>
      </HrSpecChip>
    );
  }
  if (person.hasUnresolvedDuplicates || person.isDuplicateCandidate) {
    return (
      <HrSpecChip tokens={duplicateTokens} icon="warning">
        Можливий дублікат
      </HrSpecChip>
    );
  }
  return (
    <HrSpecChip tokens={hrStatusTokens('active')} icon="success">
      Активна
    </HrSpecChip>
  );
}
