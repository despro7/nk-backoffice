import { PersonCard } from '@/components/person-card/PersonCard';
import type { PersonCardInitialValues } from '@/components/person-card/PersonCard.types';
import type { HrPersonDto } from '@shared/types/hr';

export type { PersonCardInitialValues };

interface PersonDrawerProps {
  isOpen: boolean;
  person?: HrPersonDto | null;
  initialValues?: PersonCardInitialValues;
  canManage?: boolean;
  enableMerge?: boolean;
  syncOnSave?: boolean;
  onClose: () => void;
  onSaved: (person: HrPersonDto) => void;
}

export function PersonDrawer(props: PersonDrawerProps) {
  return <PersonCard {...props} />;
}
