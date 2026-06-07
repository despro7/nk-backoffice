import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import type { DilovodDirectories } from '../../shared/types/dilovod';

type DirectoriesContextType = {
  directories: DilovodDirectories | null;
  loading: boolean;
  setDirectories: (dirs: DilovodDirectories | null) => void;
  loadDirectories: (force?: boolean) => Promise<void>;
  lastApiKey?: string | null;
  setLastApiKey?: (k: string | null) => void;
};

const DilovodDirectoriesContext = createContext<DirectoriesContextType | undefined>(undefined);

export const useDilovodDirectories = () => {
  const ctx = useContext(DilovodDirectoriesContext);
  if (!ctx) throw new Error('useDilovodDirectories must be used within DilovodDirectoriesProvider');
  return ctx;
};

export const DilovodDirectoriesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [directories, setDirectoriesState] = useState<DilovodDirectories | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastApiKey, setLastApiKey] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const setDirectories = useCallback((dirs: DilovodDirectories | null) => {
    setDirectoriesState(dirs);
  }, []);

  const loadDirectories = useCallback((force = false): Promise<void> => {
    // Якщо запит вже виконується і це не примусове перезавантаження —
    // повертаємо ТОЙ САМИЙ проміс, щоб усі паралельні виклики чекали на один запит.
    if (inFlightRef.current && !force) {
      return inFlightRef.current;
    }

    // Deferred-проміс: присвоюємо inFlightRef.current СИНХРОННО, до початку async-роботи.
    // Це гарантує, що будь-який наступний виклик у тому ж event-loop-тіку
    // отримає вже встановлений inFlightRef і не запустить паралельний fetch.
    let resolveFn!: () => void;
    let rejectFn!: (err: unknown) => void;
    const deferred = new Promise<void>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    inFlightRef.current = deferred;

    (async () => {
      setLoading(true);
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('DilovodDirectoriesProvider: fetching directories from API...');
        }
        const res = await fetch('/api/dilovod/directories', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (body && body.success) {
          setDirectoriesState(body.data || null);
          if (process.env.NODE_ENV === 'development') {
            console.log('DilovodDirectoriesProvider: directories loaded');
          }
        }
        resolveFn();
      } catch (err) {
        rejectFn(err);
      } finally {
        setLoading(false);
        inFlightRef.current = null;
      }
    })();

    return deferred;
  }, []);

  return (
    <DilovodDirectoriesContext.Provider value={{ directories, loading, setDirectories, loadDirectories, lastApiKey, setLastApiKey }}>
      {children}
    </DilovodDirectoriesContext.Provider>
  );
};

export default DilovodDirectoriesProvider;
