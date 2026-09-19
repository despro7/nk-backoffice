import React, { useEffect, useState, ReactNode } from 'react';
import { useAuth } from './auth-context';
import { useDebug, DebugContext } from './debug-context';
import { ToastService } from '@/services/ToastService';

interface DebugProviderProps {
  children: ReactNode;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function DebugModeHotkeyListener() {
  const { user } = useAuth();
  const { isDebugMode, setDebugMode } = useDebug();
  const isAdmin = Boolean(user && user.role === 'admin');

  useEffect(() => {
    if (!isAdmin) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isEditableKeyboardTarget(event.target)) return;
      // TimesheetGrid: F2 = редагування годин у комірці
      if (event.target instanceof HTMLElement && event.target.closest('[role="grid"]')) return;

      event.preventDefault();
      const next = !isDebugMode;
      setDebugMode(next);
      ToastService.show({
        title: next ? 'Debug mode увімкнено' : 'Debug mode вимкнено',
        color: next ? 'danger' : 'default',
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin, isDebugMode, setDebugMode]);

  return null;
}

export function DebugProvider({ children }: DebugProviderProps) {
  const [isDebugMode, setIsDebugMode] = useState(false);

  const setDebugMode = (enabled: boolean) => {
    setIsDebugMode(enabled);
  };

  return (
    <DebugContext.Provider value={{ isDebugMode, setDebugMode }}>
      <DebugModeHotkeyListener />
      {children}
    </DebugContext.Provider>
  );
}
