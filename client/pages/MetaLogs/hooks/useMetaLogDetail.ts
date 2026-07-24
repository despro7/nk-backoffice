import { useCallback, useState } from 'react';
import type { MetaLogRow } from '@shared/types/metaLog';

export function useMetaLogDetail() {
  const [logOpen, setLogOpen] = useState(false);
  const [logRow, setLogRow] = useState<MetaLogRow | null>(null);
  const [logDetail, setLogDetail] = useState<Record<string, unknown> | null>(null);
  const [logLoading, setLogLoading] = useState(false);

  const openLogDrawer = useCallback(async (row: MetaLogRow) => {
    setLogRow(row);
    setLogOpen(true);
    setLogDetail(null);

    const logId = row.sourceIds?.[0] ?? row.id;
    setLogLoading(true);
    try {
      const res = await fetch(`/api/meta-logs/${logId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error) {
          setLogDetail(data);
        }
      }
    } catch {
      // fallback — показуємо агрегований рядок
    } finally {
      setLogLoading(false);
    }
  }, []);

  const closeLogDrawer = useCallback(() => {
    setLogOpen(false);
    setLogRow(null);
    setLogDetail(null);
    setLogLoading(false);
  }, []);

  return {
    logOpen,
    logRow,
    logDetail,
    logLoading,
    openLogDrawer,
    closeLogDrawer,
    setLogOpen,
  };
}
