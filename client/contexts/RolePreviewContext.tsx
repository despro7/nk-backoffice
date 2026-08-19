import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { ROLES, isRoleValue, type RoleValue } from '@shared/constants/roles';
import { installRolePreviewFetch, setRolePreviewFetchRole } from '@/lib/rolePreviewFetch';

const STORAGE_KEY = 'rolePreview';

interface RolePreviewContextType {
  previewRole: RoleValue | null;
  setPreviewRole: (role: RoleValue | null) => void;
  effectiveRole: string | undefined;
  isPreviewing: boolean;
  isRealAdmin: boolean;
  isAdminView: boolean;
}

const RolePreviewContext = createContext<RolePreviewContextType | undefined>(undefined);

/**
 * Зчитує з sessionStorage встановлену роль для превʼю, якщо вона валідна та не є ADMIN.
 */
function readStoredPreview(): RoleValue | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return isRoleValue(stored) && stored !== ROLES.ADMIN ? stored : null;
  } catch {
    return null;
  }
}

interface RolePreviewProviderProps {
  children: ReactNode;
}

/**
 * Провайдер контексту превʼю ролі.
 * Дозволяє адміністратору переглядати сторінку під іншою роллю.
 */
export function RolePreviewProvider({ children }: RolePreviewProviderProps) {
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [previewRole, setPreviewRoleState] = useState<RoleValue | null>(readStoredPreview);
  const previousPreviewRef = useRef<RoleValue | null | undefined>(undefined);

  const isRealAdmin = user?.role === ROLES.ADMIN;

  // Слідкує за зміною користувача/автентифікації та скидає превʼю, якщо доступ не дозволяється
  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      setPreviewRoleState(null);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
      return;
    }

    if (!isRealAdmin && previewRole) {
      setPreviewRoleState(null);
    }
  }, [isLoading, user, isRealAdmin, previewRole]);

  /**
   * Встановлює роль для превʼю (тільки для admin).
   * Зберігає її у sessionStorage.
   */
  const setPreviewRole = (role: RoleValue | null) => {
    if (!isRealAdmin) return;

    const next = role && role !== ROLES.ADMIN ? role : null;
    setPreviewRoleState(next);
    try {
      if (next) {
        sessionStorage.setItem(STORAGE_KEY, next);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  };

  const activePreview = isRealAdmin ? previewRole : null;
  const effectiveRole = activePreview ?? user?.role;
  const isPreviewing = Boolean(activePreview);
  const isAdminView = effectiveRole === ROLES.ADMIN;

  // Встановлює глобальні функції/змінні для роботи превʼю ролі поза React
  installRolePreviewFetch();
  setRolePreviewFetchRole(activePreview);

  // Скидає кеш запитів при зміні ролі превʼю
  useEffect(() => {
    if (previousPreviewRef.current === undefined) {
      previousPreviewRef.current = activePreview;
      return;
    }
    if (previousPreviewRef.current === activePreview) return;
    previousPreviewRef.current = activePreview;
    void queryClient.resetQueries();
  }, [activePreview, queryClient]);

  return (
    <RolePreviewContext.Provider
      value={{
        previewRole: activePreview,
        setPreviewRole,
        effectiveRole,
        isPreviewing,
        isRealAdmin,
        isAdminView,
      }}
    >
      {children}
    </RolePreviewContext.Provider>
  );
}

/**
 * Хук для отримання значення контексту превʼю ролі.
 */
export function useRolePreview() {
  const context = useContext(RolePreviewContext);
  if (context === undefined) {
    throw new Error('useRolePreview must be used within a RolePreviewProvider');
  }
  return context;
}
