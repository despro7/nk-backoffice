import { createContext, useContext } from 'react';
import { UserType, LoginRequest, RegisterRequest } from '../../server/types/auth';
import type { EquipmentState, EquipmentActions } from '../hooks/useEquipment';

export interface UserWithExpiry extends Omit<UserType, 'password' | 'refreshToken' | 'refreshTokenExpiresAt'> {
  expiresIn?: number;
  permissions?: string[];
}

export interface AuthContextType {
  user: UserWithExpiry | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<boolean>;
  register: (userData: RegisterRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  forceLogout: () => void;
  refreshToken: () => Promise<boolean>;
  checkAuthStatus: () => Promise<void>;
  equipmentState: EquipmentState;
  equipmentActions: EquipmentActions;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useEquipmentFromAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useEquipmentFromAuth must be used within an AuthProvider');
  }
  const { equipmentState, equipmentActions } = context;
  return [equipmentState, equipmentActions] as const;
}
