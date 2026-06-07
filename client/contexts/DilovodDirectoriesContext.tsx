import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import type { DilovodDirectories } from '../../shared/types/dilovod';

type DirectoriesContextType = {
  directories: DilovodDirectories | null;
  loading: boolean;
  setDirectories: (dirs: DilovodDirectories | null) => void;
  loadDirectories: (force?: boolean) => Promise<void>;
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

  const setDirectories = useCallback((dirs: DilovodDirectories | null) => {
    setDirectoriesState(dirs);
  }, []);

  const loadDirectories = useCallback(async (force = false) => {
    if (loading && !force) return;
    setLoading(true);
    try {
      const res = await fetch('/api/dilovod/directories', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body && body.success) {
        setDirectoriesState(body.data || null);
      }
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return (
    <DilovodDirectoriesContext.Provider value={{ directories, loading, setDirectories, loadDirectories }}>
      {children}
    </DilovodDirectoriesContext.Provider>
  );
};

export default DilovodDirectoriesProvider;
