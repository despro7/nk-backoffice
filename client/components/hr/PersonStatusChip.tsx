import { getSpecColorByHue } from '@shared/utils/specColorPalette';
import type { HrPersonDto } from '@shared/types/hr';
import { SpecChip } from '@/pages/Hr/hrUi';

const duplicateTokens = getSpecColorByHue('amber', 'light', 'soft');
const mergedTokens = getSpecColorByHue('blue', 'light', 'soft');

interface PersonStatusChipProps {
  person: HrPersonDto;
  rounded?: 'full' | 'sm';
}

export function PersonStatusChip({ person, rounded = 'full' }: PersonStatusChipProps) {
  if (person.mergedCount > 0) {
    return (
      <SpecChip tokens={mergedTokens} icon="merge" rounded={rounded}>
        Обʼєднано
        <span className="text-xs opacity-80">({person.mergedCount})</span>
      </SpecChip>
    );
  }
  if (person.hasUnresolvedDuplicates) {
    return (
      <SpecChip tokens={duplicateTokens} icon="warning" rounded={rounded}>
        Дублікат
      </SpecChip>
    );
  }
  return null;
}
