import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useServerStatus } from "@/hooks/useServerStatus";
import { cn, log } from "@/lib/utils";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, User, Switch } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import CountdownTimer from "./CountdownTimer";
import { useEquipmentFromAuth } from "../contexts/AuthContext";
import { addToast } from "@heroui/toast";
import { DebugModeSwitch } from "./DebugModeSwitch";
import { useDebug } from "../contexts/DebugContext";

interface HeaderProps {
  className?: string;
  onDebugModeChange?: (isEnabled: boolean) => void;
}

export function Header({ className, onDebugModeChange }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const api = useApi();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [equipmentState, equipmentActions] = useEquipmentFromAuth();
  const { isOnline, isLoading } = useServerStatus();
  const { setDebugMode } = useDebug();
  
  // Убираем лишние состояния - используем только equipmentState.isLoading

  // Слушаем изменения полноэкранного режима
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Поддержка различных браузеров
      const fullscreenElement = 
        document.fullscreenElement || 
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;
      
      setIsFullscreen(!!fullscreenElement);
    };

    // Слушаем события для различных браузеров
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    // Устанавливаем начальное состояние
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);
  
  const handleLogout = () => {
    logout();
    // Перенаправляем на страницу авторизации после выхода
    navigate('/auth');
  };

  
  // Переключение режима симуляции
  const toggleSimulationMode = async (enabled: boolean) => {
    const newConnectionType: "local" | "simulation" = enabled ? "simulation" : "local";

    try {
      // 1. Всегда обновляем состояние, даже если config еще не загружен
      equipmentActions.updateConfig({ connectionType: newConnectionType });
      equipmentActions.setConnectionType(newConnectionType);

      // 2. Отправляем запрос на сервер только если config уже загружен
      if (equipmentState.config) {
        await fetch('/api/settings/equipment/connectionType', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ value: newConnectionType })
        });
      }

      addToast({
        title: "Успіх",
        description: <span>Режим симуляції <b>{enabled ? 'активовано' : 'вимкнено'}</b></span>,
        color: "warning",
        variant: "solid",
      });

    } catch (error) {
      console.error('❌ Error:', error);

      addToast({
        title: "Помилка",
        description: "Не вдалося змінити режим симуляції",
        color: "danger",
      });
    }
  };

  return (
    <header className={cn("flex flex-col sm:flex-row justify-between items-center px-8 py-4 sm:px-xl border-b border-grey-200 bg-background-paper gap-4 sm:gap-0", className)}>
      {/* Timer Section */}
      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-center sm:justify-start text-neutral-500">
        <div className="flex items-center gap-1.5 w-[138px] wrap-break-word px-2.5 py-2 rounded-sm bg-neutral-100">
          <DynamicIcon name="hourglass" size={18} color="currentColor" className="flex-shrink-0" />
          <CountdownTimer />
        </div>
        <div className="w-[100px] text-[13px] leading-[110%] text-neutral-400">
          до наступного відправлення
        </div>
      </div>

      {/* Server Status Indicator - Center */}
      {/* <div className="flex items-center gap-2 justify-center sm:w-auto ml-10">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm">
          {isLoading ? (
            <div className="animate-spin rounded-full h-3 w-3 border-b border-neutral-400"></div>
          ) : (
            <div
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-600' : 'bg-red-500'
              }`}
            />
          )}
          <span className={`text-sm font-medium ${
            isOnline ? 'text-green-600' : 'text-red-700'
          }`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div> */}

      {/* Debug Mode Switch */}
      <DebugModeSwitch onDebugModeChange={onDebugModeChange} />

      {/* Full Screen Button */}
      <button
        type="button"
        aria-label={isFullscreen ? "Minimize screen" : "Full screen"}
        className="flex items-center justify-center gap-1.5 rounded-sm transition-all duration-200 bg-neutral-100 text-neutral-600 p-2 ml-auto mr-16"
        onClick={() => {
          if (isFullscreen) {
            // Выход из полноэкранного режима с поддержкой различных браузеров
            if (document.exitFullscreen) {
              document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
              (document as any).webkitExitFullscreen();
            } else if ((document as any).mozCancelFullScreen) {
              (document as any).mozCancelFullScreen();
            } else if ((document as any).msExitFullscreen) {
              (document as any).msExitFullscreen();
            }
          } else {
            // Вход в полноэкранный режим с поддержкой различных браузеров
            const element = document.documentElement;
            if (element.requestFullscreen) {
              element.requestFullscreen();
            } else if ((element as any).webkitRequestFullscreen) {
              (element as any).webkitRequestFullscreen();
            } else if ((element as any).mozRequestFullScreen) {
              (element as any).mozRequestFullScreen();
            } else if ((element as any).msRequestFullscreen) {
              (element as any).msRequestFullscreen();
            }
          }
        }}
      >
        <DynamicIcon
          name={isFullscreen ? "minimize" : "maximize"}
          size={24}
          strokeWidth={2}
          color="currentColor"
        /> {isFullscreen ? "Minimize" : "Full screen"}
      </button>

      {/* User Profile Section */}
      {user && (
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-center sm:justify-end">
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <User
                as="button"
                avatarProps={{
                  isBordered: false,
                  showFallback: true,
                  color: "secondary",
                  fallback: <DynamicIcon name="user-round" size={20} color="white" />,
                  // src: "https://i.pravatar.cc/150?u=a048581f4e29026701d21",
                }}
                classNames={{
                  base: "cursor-pointer transition-transform",
                  name: "text-grey-700 text-base font-semibold",
                  description: "text-grey-500 text-[13px] leading-[110%]"
                }}
                name={user.name || user.email}
                description={user.roleName || user.role || 'Користувач'}
              />
            </DropdownTrigger>
            <DropdownMenu aria-label="User Actions" variant="flat">
              <DropdownItem 
                key="settings" 
                startContent={<DynamicIcon name="user-round" size={18} />}
                onClick={() => navigate('/profile')}
              >
                Мій профіль
              </DropdownItem>
              <DropdownItem key="logout" startContent={<DynamicIcon name="log-out" size={18} />} onClick={handleLogout} color="danger">
                Вийти
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      )}
    </header>
  );
}