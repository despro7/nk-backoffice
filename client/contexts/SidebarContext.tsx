import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

const LG_BREAKPOINT = 1024;
const XL_BREAKPOINT = 1280;
const STORAGE_KEY = 'nova-field:sidebar-open';

function isBelowXl(): boolean {
  return window.innerWidth < XL_BREAKPOINT;
}

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
    return isBelowXl() ? false : readDesktopPreference();
  });

  useEffect(() => {
    const mobileMql = window.matchMedia(`(max-width: ${LG_BREAKPOINT - 1}px)`);
    const xlMql = window.matchMedia(`(max-width: ${XL_BREAKPOINT - 1}px)`);

    const onMobileChange = () => {
      const mobile = window.innerWidth < LG_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) setOpenState(false);
    };

    const onXlChange = () => {
      if (window.innerWidth < LG_BREAKPOINT) {
        setOpenState(false);
        return;
      }
      // Нижче XL — автоматично ховаємо; на XL+ відновлюємо збережену перевагу
      setOpenState(isBelowXl() ? false : readDesktopPreference());
    };

    mobileMql.addEventListener('change', onMobileChange);
    xlMql.addEventListener('change', onXlChange);
    return () => {
      mobileMql.removeEventListener('change', onMobileChange);
      xlMql.removeEventListener('change', onXlChange);
    };
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      // Зберігаємо лише на широкому десктопі, щоб автоприховування < XL не затирала preference
      if (!isMobile && window.innerWidth >= XL_BREAKPOINT) {
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
