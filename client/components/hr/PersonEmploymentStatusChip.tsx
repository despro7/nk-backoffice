import { SpecChip, hrStatusTokens } from '@/pages/Hr/hrUi';
import { getSpecColorByHue } from '@shared/utils/specColorPalette';
import type { SpecChipIcon } from '@/components/SpecChip';
import type { HrPersonDto } from '@shared/types/hr';
import {
  getPersonEmploymentDisplayLabel,
  resolvePersonEmploymentDisplayStatus,
  type HrPersonEmploymentDisplayStatus,
} from '@shared/utils/hrPersonEmploymentStatus';

const dismissedTokens = getSpecColorByHue('slate', 'light', 'soft');
const noEmploymentTokens = getSpecColorByHue('amber', 'light', 'soft');

function chipMetaForStatus(status: HrPersonEmploymentDisplayStatus): {
  tokens: ReturnType<typeof hrStatusTokens>;
  icon?: SpecChipIcon;
} {
  switch (status) {
    case 'active':
      return { tokens: hrStatusTokens('active'), icon: 'success' };
    case 'dismissed':
      return { tokens: dismissedTokens, icon: 'default' };
    case 'inactive':
      return { tokens: hrStatusTokens('inactive'), icon: 'error' };
    case 'no_active_employment':
      return { tokens: noEmploymentTokens, icon: 'warning' };
    default:
      return { tokens: hrStatusTokens('inactive') };
  }
}

interface PersonEmploymentStatusChipProps {
  person: Pick<HrPersonDto, 'linkedEmployee' | 'dilovodParentId' | 'personGroupLabel' | 'employerName'>;
  emptyClassName?: string;
  rounded?: 'full' | 'sm';
}

export function PersonEmploymentStatusChip({
  person,
  emptyClassName = 'text-gray-300',
  rounded = 'full',
}: PersonEmploymentStatusChipProps) {
  const displayStatus = resolvePersonEmploymentDisplayStatus(person);
  const label = getPersonEmploymentDisplayLabel(person);
  if (!label) {
    return <span className={emptyClassName}>—</span>;
  }

  const { tokens, icon } = chipMetaForStatus(displayStatus);
  return (
    <SpecChip tokens={tokens} icon={icon} rounded={rounded}>
      {label}
    </SpecChip>
  );
}
