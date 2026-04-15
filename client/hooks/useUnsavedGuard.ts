import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom';

// ---------------------------------------------------------------------------
// useUnsavedGuard — загальний хук для блокування навігації при незбережених змінах.
//
// Сумісний з BrowserRouter (не потребує data router / createBrowserRouter).
// Перехоплює:
//   1. Програмну навігацію через react-router (push/replace через history)
//   2. Кнопку "назад/вперед" браузера (popstate)
//   3. Закриття/перезавантаження вкладки (beforeunload)
//
// Використання:
//   const guard = useUnsavedGuard({ isDirty, onSaveDraft });
//   <UnsavedChangesModal {...guard.modalProps} />
//
// isDirty      — чи є незбережені зміни
// onSaveDraft  — async-функція збереження чернетки
// ---------------------------------------------------------------------------

export interface UseUnsavedGuardOptions {
  isDirty: boolean;
  onSaveDraft: () => Promise<unknown>;
}

export interface UnsavedGuardModalProps {
  isOpen: boolean;
  isSaving: boolean;
  onSave: () => Promise<void>;
  onLeave: () => void;
  onCancel: () => void;
  // Кастомні тексти — можуть змінюватись в залежності від дії
  title?: string;
  message?: string;
  saveText?: string;
  leaveText?: string;
  cancelText?: string;
  modalSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

/** Кастомні тексти для конкретного guardAction-виклику */
export interface GuardActionLabels {
  title?: string;
  message?: string;
  saveText?: string;
  leaveText?: string;
  cancelText?: string;
  modalSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export interface UseUnsavedGuardReturn {
  modalProps: UnsavedGuardModalProps;
  /**
   * Обгортає довільну async-дію захистом від незбережених змін.
   * Якщо isDirty=true — показує модалку і виконує дію лише після рішення користувача.
   * Якщо isDirty=false — виконує дію одразу.
   *
   * Використання:
   *   onPress={guard.guardAction(mov.handleSyncBalances)}
   *   onPress={guard.guardAction(mov.handleSyncBalances, { title: 'Увага!', message: '...' })}
   */
  guardAction: (action: () => void | Promise<void>, labels?: GuardActionLabels) => () => void;
}

export function useUnsavedGuard({ isDirty, onSaveDraft }: UseUnsavedGuardOptions): UseUnsavedGuardReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Зберігаємо відкладений callback навігації — виконаємо після рішення користувача
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  // Зберігаємо кастомні тексти для поточного виклику guardAction
  const pendingLabelsRef = useRef<GuardActionLabels | null>(null);

  // Доступ до history через NavigationContext (сумісно з BrowserRouter)
  const { navigator } = useContext(NavigationContext);

  // ── Блокування програмної навігації (react-router push/replace) ──────────
  useEffect(() => {
    if (!isDirty) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    const originalPush = nav.push.bind(nav);
    const originalReplace = nav.replace.bind(nav);

    nav.push = (...args: Parameters<typeof originalPush>) => {
      pendingNavigationRef.current = () => originalPush(...args);
      setIsOpen(true);
    };

    nav.replace = (...args: Parameters<typeof originalReplace>) => {
      pendingNavigationRef.current = () => originalReplace(...args);
      setIsOpen(true);
    };

    return () => {
      nav.push = originalPush;
      nav.replace = originalReplace;
    };
  }, [isDirty, navigator]);

  // ── Блокування кнопки "назад/вперед" браузера (popstate) ─────────────────
  useEffect(() => {
    if (!isDirty) return;

    // Додаємо фіктивний запис в history щоб перехопити popstate
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      // Повертаємо стан назад (скасовуємо навігацію браузера)
      window.history.pushState(null, '', window.location.href);
      pendingNavigationRef.current = () => window.history.go(-1);
      setIsOpen(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDirty]);

  // ── Блокування закриття / перезавантаження вкладки ───────────────────────
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Для сучасних браузерів достатньо returnValue = ''
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSaveDraft();
      setIsOpen(false);
      pendingNavigationRef.current?.();
      pendingNavigationRef.current = null;
    } catch {
      // Збереження не вдалось — залишаємось на сторінці
    } finally {
      setIsSaving(false);
    }
  }, [onSaveDraft]);

  const handleLeave = useCallback(() => {
    setIsOpen(false);
    pendingNavigationRef.current?.();
    pendingNavigationRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    pendingNavigationRef.current = null;
    pendingLabelsRef.current = null;
  }, []);

  // ── guardAction — перехоплення довільних дій (не навігації) ──────────────
  const guardAction = useCallback(
    (action: () => void | Promise<void>, labels?: GuardActionLabels) => () => {
      if (!isDirty) {
        // Немає незбережених змін — виконуємо одразу
        void action();
        return;
      }
      // Є незбережені зміни — зберігаємо відкладену дію і показуємо модалку
      pendingNavigationRef.current = () => void action();
      pendingLabelsRef.current = labels ?? null;
      setIsOpen(true);
    },
    [isDirty],
  );

  return {
    modalProps: {
      isOpen,
      isSaving,
      onSave: handleSave,
      onLeave: handleLeave,
      onCancel: handleCancel,
      // Кастомні тексти від guardAction (або undefined — модалка покаже дефолтні)
      ...pendingLabelsRef.current,
    },
    guardAction,
  };
}
