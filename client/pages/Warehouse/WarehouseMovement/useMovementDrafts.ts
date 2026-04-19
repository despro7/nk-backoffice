import { useState, useCallback } from 'react';
import { ToastService } from '@/services/ToastService';
import type { MovementDraft } from './WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// useMovementDrafts — завантаження та управління чернетками переміщень
// ---------------------------------------------------------------------------

interface UseMovementDraftsReturn {
  drafts: MovementDraft[];
  loading: boolean;
  error: string | null;
  loadDrafts: () => Promise<void>;
  removeDraft: (id: number) => Promise<void>;
}

export function useMovementDrafts(
  getDrafts: () => Promise<any>,
  deleteDraft: (id: number) => Promise<any>
): UseMovementDraftsReturn {
  const [drafts, setDrafts] = useState<MovementDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDrafts();
      setDrafts(data?.drafts ?? []);
    } catch (err: any) {
      const message = err?.message || 'Помилка завантаження чернеток';
      setError(message);
      ToastService.show({ title: 'Помилка завантаження чернеток', description: message, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [getDrafts]);

  const removeDraft = useCallback(async (id: number) => {
    try {
      await deleteDraft(id);
      setDrafts(prev => prev.filter(d => d.id !== id));
      ToastService.show({ title: 'Чернетку видалено', color: 'success' });
    } catch (err: any) {
      const message = err?.message || 'Помилка видалення чернетки';
      ToastService.show({ title: 'Помилка видалення', description: message, color: 'danger' });
    }
  }, [deleteDraft]);

  return { drafts, loading, error, loadDrafts, removeDraft };
}
