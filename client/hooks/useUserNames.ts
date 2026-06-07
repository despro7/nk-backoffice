import { useEffect, useRef, useState } from 'react';

export function useUserNames(ids: Array<number | null | undefined>) {
  const [map, setMap] = useState<Record<number, string>>({});
  const fetchedRef = useRef<Record<number, boolean>>({});

  useEffect(() => {
    const need = Array.from(new Set(ids.filter(Boolean) as number[])).filter(id => !fetchedRef.current[id]);
    if (need.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/users?ids=${need.join(',')}`, { credentials: 'include' });
        const json = await resp.json();
        if (json?.success && !cancelled) {
          const byId = Object.fromEntries((json.data || []).map((u: any) => [u.id, u.name]));
          setMap(m => ({ ...m, ...byId }));
          need.forEach((id: number) => { fetchedRef.current[id] = true; });
        }
      } catch (e) {
        // ignore network errors for now
      }
    })();

    return () => { cancelled = true; };
  }, [ids.join(',')]);

  return map;
}

export default useUserNames;
