export interface UserCardInitialValues {
  name?: string;
  email?: string;
  role?: string;
  dilovodUserId?: string;
}

export interface EditableUser {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  dilovodUserId: string | null;
}

export interface SavedUserSummary {
  id: number;
  name: string;
  email: string;
}

export interface UserCardProps {
  isOpen: boolean;
  user?: EditableUser | null;
  initialValues?: UserCardInitialValues;
  onClose: () => void;
  onSaved: (user: SavedUserSummary) => void;
}
