import { useEffect, useMemo, useRef, useState } from 'react';
import releaseNotes from '@shared/releaseNotes.json';
import type { ReleaseNotes } from '@shared/types/releaseNotes';
import { compareVersions, filterReleasesByPermissions } from '@shared/utils/releaseNotes';
import { useRolePreview } from '@/contexts/role-preview-context';

const STORAGE_KEY = 'whatsNewLastSeenVersion';

const allReleases = (releaseNotes as ReleaseNotes).releases;

/** Версія зібраного застосунку = найновіший реліз. */
export const CURRENT_VERSION = allReleases[0]?.version ?? '0.0.0';

function storeSeen(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, version);
  } catch {
    // ignore storage errors
  }
}

/** Новий користувач (значення нема): запамʼятовуємо поточну версію без авто-відкриття. */
function readSeen(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    return CURRENT_VERSION;
  }
  storeSeen(CURRENT_VERSION);
  return CURRENT_VERSION;
}

export function useWhatsNew() {
  const { effectivePermissions, isPreviewing } = useRolePreview();
  const [lastSeen, setLastSeen] = useState(readSeen);
  const [isOpen, setIsOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  const releases = useMemo(
    () => filterReleasesByPermissions(allReleases, effectivePermissions),
    [effectivePermissions],
  );
  const hasUnread = releases.some((release) => compareVersions(release.version, lastSeen) > 0);

  useEffect(() => {
    // Під час перегляду чужої ролі нічого не відкриваємо самі.
    if (!hasUnread || isPreviewing || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    setIsOpen(true);
  }, [hasUnread, isPreviewing]);

  const open = () => setIsOpen(true);

  const close = () => {
    setIsOpen(false);
    if (isPreviewing) return;
    storeSeen(CURRENT_VERSION);
    setLastSeen(CURRENT_VERSION);
  };

  return { releases, hasUnread, isOpen, open, close };
}
