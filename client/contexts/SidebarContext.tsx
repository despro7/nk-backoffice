import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

const LG_BREAKPOINT = 1024;
const STORAGE_KEY = 'nova-field:sidebar-open';

interface SidebarContextType {
  open: boolean;
  isMobile: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

function readDesktopPreference(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

function writeDesktopPreference(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // ignore
  }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < LG_BREAKPOINT : false
  );
  const [open, setOpenState] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth < LG_BREAKPOINT ? false : readDesktopPreference();
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${LG_BREAKPOINT - 1}px)`);
    const onChange = () => {
      const mobile = window.innerWidth < LG_BREAKPOINT;
      setIsMobile(mobile);
      setOpenState(mobile ? false : readDesktopPreference());
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (!isMobile) {
        writeDesktopPreference(next);
      }
    },
    [isMobile]
  );

  const toggle = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  return (
    <SidebarContext.Provider value={{ open, isMobile, setOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextType {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
