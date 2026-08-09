import { useEffect } from 'react';

const APP_HEIGHT_VAR = '--app-vvh';
const APP_TOP_VAR = '--app-vv-top';
const LOCK_CLASS = 'app-vv-locked';
const LG_BREAKPOINT = 1024;

/**
 * Прив'язує mobile shell до Visual Viewport і блокує scroll документа.
 *
 * Чому попередній фікс «не працював»:
 * `min-h-screen` (min-height: 100vh) > `--app-vvh` → за CSS min-height
 * перебиває max-height, shell лишався вищим за видиму зону, TabBar під URL-баром.
 *
 * Рішення: fixed shell з top/height з visualViewport + overflow:hidden на html/body.
 */
export function useVisualViewportLock(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const mql = window.matchMedia(`(max-width: ${LG_BREAKPOINT - 1}px)`);

    const clear = () => {
      root.style.removeProperty(APP_HEIGHT_VAR);
      root.style.removeProperty(APP_TOP_VAR);
      root.classList.remove(LOCK_CLASS);
    };

    const sync = () => {
      if (!mql.matches) {
        clear();
        return;
      }

      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const top = vv?.offsetTop ?? 0;

      root.style.setProperty(APP_HEIGHT_VAR, `${Math.round(height * 100) / 100}px`);
      root.style.setProperty(APP_TOP_VAR, `${Math.round(top * 100) / 100}px`);
      root.classList.add(LOCK_CLASS);
    };

    sync();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    mql.addEventListener('change', sync);

    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      mql.removeEventListener('change', sync);
      clear();
    };
  }, []);
}
