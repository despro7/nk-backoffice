import { useState } from 'react';
import { Button } from '@heroui/button';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { usePermissionsRevisionCheck } from '@/hooks/usePermissionsRevisionCheck';
import { useRolePreview } from '@/contexts/role-preview-context';
import { WhatsNewModal } from '@/components/whats-new/WhatsNewModal';
import { CURRENT_VERSION } from '@/components/whats-new/useWhatsNew';
import { compareVersions, filterReleasesByPermissions } from '@shared/utils/releaseNotes';

/**
 * Sticky-банер внизу екрану після нового деплою або зміни прав ролі.
 * Пропонує перезавантажити сторінку.
 */
export function UpdateNotificationBanner() {
  const { updateAvailable, latestReleases } = useVersionCheck();
  const { permissionsChanged } = usePermissionsRevisionCheck();
  const { effectivePermissions } = useRolePreview();
  const [notesOpen, setNotesOpen] = useState(false);

  if (!updateAvailable && !permissionsChanged) return null;

  const handleReload = () => {
    window.location.reload();
  };

  const message = updateAvailable
    ? 'Доступна нова версія застосунку. Збережіть свої зміни при необхідності та оновіть сторінку, щоб отримати останні оновлення.'
    : 'Права доступу змінено. Збережіть роботу та оновіть сторінку, щоб застосувати нові налаштування ролей.';

  // Лише те, чого ще нема у відкритій вкладці.
  const upcoming = filterReleasesByPermissions(
    latestReleases.filter((release) => compareVersions(release.version, CURRENT_VERSION) > 0),
    effectivePermissions,
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-yellow-400 px-4 sm:px-6 py-4 shadow-lg">
      <div className="flex items-center gap-3 text-yellow-950">
        <DynamicIcon name="refresh-cw" size={20} className="shrink-0" />
        <span className="text-sm font-medium">{message}</span>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3">
        {upcoming.length > 0 && (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="cursor-pointer text-sm font-semibold text-yellow-950 underline underline-offset-2"
          >
            Що змінилось
          </button>
        )}
        <Button
          size="sm"
          variant="solid"
          className="shrink-0 text-yellow-950 font-semibold bg-yellow-100/80 hover:bg-white hover:opacity-100!"
          onPress={handleReload}
          startContent={<DynamicIcon name="refresh-cw" size={16} />}
        >
          Оновити зараз
        </Button>
      </div>
      <WhatsNewModal
        isOpen={notesOpen}
        onClose={() => setNotesOpen(false)}
        releases={upcoming}
        overlayZClassName="z-[10000]"
      />
    </div>
  );
}
