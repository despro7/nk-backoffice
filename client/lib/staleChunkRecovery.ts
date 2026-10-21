/**
 * Відновлення після деплою: якщо вкладка тримає старий index.html (кеш браузера,
 * «Дублювати вкладку», bfcache), його chunks уже видалені з сервера, і dynamic import падає.
 * Робимо одне перезавантаження сторінки – воно підтягує свіжий index.html з актуальними хешами.
 */

const LAST_RELOAD_KEY = 'stale-chunk-reload-at';
/** Захист від нескінченного циклу, якщо chunk відсутній і після перезавантаження. */
const RELOAD_COOLDOWN_MS = 30_000;

function readLastReloadAt(): number {
  try {
    return Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Повертає true, якщо перезавантаження запущено (і помилку не треба показувати). */
export function reloadForStaleChunk(): boolean {
  if (Date.now() - readLastReloadAt() < RELOAD_COOLDOWN_MS) return false;

  try {
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}

/** Vite генерує цю подію для будь-якого dynamic import / preload, що не завантажився. */
export function installStaleChunkRecovery(): void {
  if (import.meta.env.DEV) return;

  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForStaleChunk()) event.preventDefault();
  });
}

/** Promise, що ніколи не завершиться: тримає Suspense fallback, поки йде перезавантаження. */
export function waitForReload<T>(): Promise<T> {
  return new Promise<T>(() => {});
}
