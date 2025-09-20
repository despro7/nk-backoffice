import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DebugContextType {
  isDebugMode: boolean;
  setDebugMode: (enabled: boolean) => void;
}

const DebugContext = createContext<DebugContextType | undefined>(undefined);

interface DebugProviderProps {
  children: ReactNode;
}

export function DebugProvider({ children }: DebugProviderProps) {
  const [isDebugMode, setIsDebugMode] = useState(false);

  const setDebugMode = (enabled: boolean) => {
    setIsDebugMode(enabled);
  };

  return (
    <DebugContext.Provider value={{ isDebugMode, setDebugMode }}>
      {children}
    </DebugContext.Provider>
  );
}

export function useDebug() {
  const context = useContext(DebugContext);
  if (context === undefined) {
    throw new Error('useDebug must be used within a DebugProvider');
  }
  return context;
}
