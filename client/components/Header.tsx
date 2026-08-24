import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRolePreview } from "../contexts/RolePreviewContext";
import { cn } from "@/lib/utils";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, User } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatDateLong, formatWeekdayOnly } from "@/lib/formatUtils";
import { NotificationBell } from "./NotificationBell";
import { SidebarTrigger } from "./SidebarTrigger";
import NumberFlow, { NumberFlowGroup } from '@number-flow/react';
// import CountdownTimer from "./CountdownTimer";

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const { user, logout } = useAuth();
  const { isPreviewing, effectiveRole, previewRoles } = useRolePreview();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  

  // Слухаємо зміни у повноекранному режимі
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Підтримка різних браузерів
      const fullscreenElement = 
        document.fullscreenElement || 
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;
      
      setIsFullscreen(!!fullscreenElement);
    };

    // Слухаємо події для різних браузерів
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    // Встановлюємо початковий стан повноекранного режиму
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();
  
  const handleLogout = () => {
    logout();
    // Перенаправляємо на сторінку авторизації після виходу
    navigate('/auth');
  };

  

  return (
    <header className={cn("pl-6 pr-8 py-4 border-b border-grey-200 bg-background-paper", className)}>
      <div className="container mx-auto flex items-center gap-6">
        <SidebarTrigger />

        {/* Full Screen Button */}
        <button
          type="button"
          aria-label={isFullscreen ? "Minimize screen" : "Full screen"}
          className="flex items-center justify-center gap-1.5 rounded-sm transition-all duration-200 bg-neutral-100 text-neutral-600 p-2"
          onClick={() => {
            if (isFullscreen) {
              // Вихід із повноекранного режиму
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
              // Перехід у повноекранний режим із підтримкою різних браузерів
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

        {/* Timer Section */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-center sm:justify-start text-neutral-500 mr-auto">
          <div className="flex items-center gap-1.5 wrap-break-word px-2.5 py-1 rounded-sm bg-neutral-100">
            {/* <CountdownTimer /> */}
            <NumberFlowGroup>
              <div className="flex flex-col items-start gap-0.5">
                <div
                  className="font-inter text-[22px] font-medium leading-[100%] flex items-baseline"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  <NumberFlow trend={-1} value={hours} format={{ minimumIntegerDigits: 2 }} />
                  <NumberFlow
                    prefix=":"
                    value={minutes}
                    digits={{ 1: { max: 5 } }}
                    format={{ minimumIntegerDigits: 2 }}
                  />
                  <NumberFlow
                    prefix=":"
                    value={seconds}
                    digits={{ 1: { max: 5 } }}
                    format={{ minimumIntegerDigits: 2 }}
                    animated={false}
                  />
                </div>
              </div>
            </NumberFlowGroup>
          </div>
          <div className="text-[13px] leading-[110%] text-neutral-400">
            <div>{formatDateLong(currentTime)}</div>
            <div>{formatWeekdayOnly(currentTime)}</div>
          </div>
        </div>
        
        {/* Notification Bell */}
        <NotificationBell onNavigate={(href) => navigate(href)} />

        {/* User Profile Section */}
        {user && (
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-center sm:justify-end ml-4">
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <User
                  as="button"
                  avatarProps={{
                    isBordered: false,
                    className: "w-[36px] h-[36px] bg-linear-to-br from-[#e0d7f2] to-[#a3b8ff] from-20% to-80%",
                    showFallback: true,
                    fallback: <DynamicIcon name="user-round" size={18} color="white" />,
                    src: "https://api.dicebear.com/9.x/initials/svg?seed=" + user.name + "&backgroundColor=a3b8ff,7ca3d8,8fa3c6&backgroundType=gradientLinear&backgroundRotation=30&chars=1"
                  }}
                  classNames={{
                    base: "cursor-pointer transition-transform",
                    name: "text-grey-700 text-sm font-semibold",
                    description: "text-grey-500 text-[12px] leading-[110%]"
                  }}
                  name={user.name || user.email}
                  description={
                    isPreviewing
                      ? `${previewRoles.find((role) => role.slug === effectiveRole)?.name ?? effectiveRole} · перегляд`
                      : (user.roleName || user.role || 'Користувач')
                  }
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
      </div>
    </header>
  );
}