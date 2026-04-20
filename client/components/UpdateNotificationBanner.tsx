import { Button } from '@heroui/button';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useVersionCheck } from '@/hooks/useVersionCheck';

/**
 * Sticky-банер внизу екрану, що з'являється коли виявлено нову версію застосунку.
 * Пропонує користувачу перезавантажити сторінку для отримання оновлень.
 */
export function UpdateNotificationBanner() {
  const { updateAvailable } = useVersionCheck();

  if (!updateAvailable) return null;

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] flex items-center justify-between gap-4 bg-yellow-400 px-6 py-4 shadow-lg">
      <div className="flex items-center gap-3 text-yellow-950">
        <DynamicIcon name="refresh-cw" size={20} className="shrink-0" />
        <span className="text-sm font-medium">
          Доступна нова версія застосунку. Збережіть свої зміни при необхідності та оновіть сторінку, щоб отримати останні оновлення.
        </span>
      </div>
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
  );
}
