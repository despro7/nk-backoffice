import { createContext, useContext } from 'react';

export interface DebugContextType {
  isDebugMode: boolean;
  setDebugMode: (enabled: boolean) => void;
}

export const DebugContext = createContext<DebugContextType | undefined>(undefined);

export function useDebug() {
  const context = useContext(DebugContext);
  if (context === undefined) {
    throw new Error('useDebug must be used within a DebugProvider');
  }
  return context;
}
