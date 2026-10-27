import React, { useCallback, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './auth-context';
import { useDebug, DebugContext } from './debug-context';
import { playSoundChoice } from '@/lib/soundUtils';

function playDebugModeToggleSound(enabled: boolean): void {
  if (enabled) {
    playSoundChoice('scan', 'success');
  } else {
    playSoundChoice('tick', 'pending');
  }
}

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
      setDebugMode(!isDebugMode);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin, isDebugMode, setDebugMode]);

  return null;
}

export function DebugProvider({ children }: DebugProviderProps) {
  const [isDebugMode, setIsDebugMode] = useState(false);

  const setDebugMode = useCallback((enabled: boolean) => {
    setIsDebugMode((prev) => {
      if (prev === enabled) return prev;
      playDebugModeToggleSound(enabled);
      return enabled;
    });
  }, []);

  return (
    <DebugContext.Provider value={{ isDebugMode, setDebugMode }}>
      <DebugModeHotkeyListener />
      {children}
    </DebugContext.Provider>
  );
}
