import { useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 хвилин
const VERSION_URL = '/version.json';

interface VersionInfo {
  hash: string;
  builtAt: number;
}

/**
 * Хук для відстеження оновлень застосунку.
 * Кожні 5 хвилин звертається до /version.json і порівнює хеш білду.
 * Якщо виявлено нову версію — повертає updateAvailable=true.
 */
export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialHashRef = useRef<string | null>(null);

  useEffect(() => {
    // У dev-режимі не перевіряємо (version.json може не існувати)
    if (import.meta.env.DEV) return;

    const fetchVersion = async (): Promise<VersionInfo | null> => {
      try {
        const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    const check = async () => {
      const info = await fetchVersion();
      if (!info) return;

      if (initialHashRef.current === null) {
        // Запам'ятовуємо початковий хеш при першому завантаженні
        initialHashRef.current = info.hash;
        return;
      }

      if (info.hash !== initialHashRef.current) {
        setUpdateAvailable(true);
      }
    };

    // Перша перевірка через 10 сек після завантаження (щоб не заважати старту)
    const initialTimer = setTimeout(check, 10_000);
    const intervalTimer = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  return { updateAvailable };
}
