import { useMemo, useRef, useState } from 'react';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import type { TechCardEditGuard } from './TechCardDocument';

/** Тексти модалки для кнопки «Скасувати» в режимі редагування. */
export const TECH_CARD_CANCEL_EDIT_LABELS = {
  title: 'Скасувати редагування?',
  message: 'Зміни рецепту ще не збережено. Що з ними зробити?',
  saveText: 'Зберегти чернетку',
  leaveText: 'Скасувати зміни',
  cancelText: 'Продовжити редагування',
};

/** Тексти модалки, коли закривають техкарту з незбереженим рецептом. */
export const TECH_CARD_UNSAVED_LABELS = {
  title: 'Незбережені зміни',
  message: 'У техкарті є незбережені зміни рецепту. Що зробити перед закриттям?',
  saveText: 'Зберегти чернетку',
  leaveText: 'Закрити без збереження',
  cancelText: 'Залишитись',
};

/**
 * Guard незбережених змін рецепту: `editGuard` – у `TechCardDocument`, `guard` – для закриття Drawer,
 * переходу зі сторінки й перезавантаження (`useUnsavedGuard`).
 */
export function useTechCardEditGuard() {
  const [dirty, setDirty] = useState(false);
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const guard = useUnsavedGuard({
    isDirty: dirty,
    onSaveDraft: async () => {
      await saveRef.current?.();
    },
  });
  // Актуальний guardAction (залежить від dirty) – через ref, щоб editGuard лишався стабільним
  const guardActionRef = useRef(guard.guardAction);
  guardActionRef.current = guard.guardAction;
  const editGuard = useMemo<TechCardEditGuard>(
    () => ({
      onDirtyChange: setDirty,
      saveRef,
      confirmDiscard: (action) => guardActionRef.current(action, TECH_CARD_CANCEL_EDIT_LABELS)(),
    }),
    [],
  );
  return { editGuard, guard, dirty };
}
