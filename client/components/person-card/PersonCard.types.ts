import type { HrPersonDto } from '@shared/types/hr';

export interface PersonCardInitialValues {
  displayName?: string;
  taxCode?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface PersonCardProps {
  isOpen: boolean;
  person?: HrPersonDto | null;
  initialValues?: PersonCardInitialValues;
  canManage?: boolean;
  enableMerge?: boolean;
  syncOnSave?: boolean;
  onClose: () => void;
  onSaved: (person: HrPersonDto) => void;
}
