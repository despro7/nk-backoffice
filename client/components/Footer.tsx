import { useServerStatusWithModal } from "@/hooks/useServerStatusWithModal";
import { DynamicIcon } from "lucide-react/dynamic";

export function Footer() {
  const { isOnline, serverStartTime, uptime } = useServerStatusWithModal();

  const formatServerStartTime = (startTime: Date | null) => {
    if (!startTime) return null;
    return startTime.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <footer className="border-t border-grey-200 shadow-inner px-8 py-3">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span>
              {isOnline ? 'Сервер онлайн' : 'Сервер офлайн'}
            </span>
          </div>
          
          {isOnline && serverStartTime && (
            <div className="flex items-center gap-1.5">
              <DynamicIcon name="clock" size={12} />
              <span>
                Працює {uptime || 'завантаження...'}
              </span>
            </div>
          )}
        </div>

        {isOnline && serverStartTime && (
          <div className="text-neutral-400">
            з {formatServerStartTime(serverStartTime)}
          </div>
        )}
      </div>
    </footer>
  );
}
