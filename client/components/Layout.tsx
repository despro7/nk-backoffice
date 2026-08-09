import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { appRoutes } from "@/routes.config";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ServerStatusModal } from "@/components/modals/ServerStatusModal";
import { useServerStatusWithModal } from "@/hooks/useServerStatusWithModal";
import { UpdateNotificationBanner } from "@/components/UpdateNotificationBanner";
import { Button } from "@heroui/button";
import { DynamicIcon } from "lucide-react/dynamic";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { useVisualViewportLock } from "@/hooks/useVisualViewportLock";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { showModal, isOffline, onCloseModal } = useServerStatusWithModal();
  const mainRef = useRef<HTMLElement>(null);

  // Mobile: висота shell = visualViewport (адресний рядок не накриває TabBar)
  useVisualViewportLock();

  // Находим подходящий роут и извлекаем параметры
  const findRouteAndParams = () => {
    for (const route of appRoutes) {
      if (!route.path.includes(':')) {
        if (route.path === location.pathname) {
          return { route, params: {} };
        }
        continue;
      }
      
      // Для динамических роутов создаем regex и извлекаем параметры
      const paramNames: string[] = [];
      const regexPattern = route.path.replace(/:[^/]+/g, (match) => {
        paramNames.push(match.slice(1)); // Убираем двоеточие
        return '([^/]+)';
      });
      
      const regex = new RegExp(`^${regexPattern}$`);
      const match = location.pathname.match(regex);
      
      if (match) {
        const params: Record<string, string> = {};
        paramNames.forEach((paramName, index) => {
          params[paramName] = match[index + 1];
        });
        return { route, params };
      }
    }
    return { route: null, params: {} };
  };

  const { route: currentRoute, params } = findRouteAndParams();

  // Получаем заголовки, учитывая что они могут быть функциями
  const getTitle = (title: string | ((params: Record<string, string>) => string)) => {
    return typeof title === 'function' ? title(params) : title;
  };

  const h1Title = currentRoute ? getTitle(currentRoute.title) : "Сторінка";
  const pageTitle = currentRoute ? getTitle(currentRoute.pageTitle) : h1Title;

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  // На mobile скрол у <main> — скидаємо при зміні маршруту
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <SidebarProvider>
      {/*
        Mobile: .app-shell--vv = fixed до visualViewport (див. global.css + useVisualViewportLock).
        min-h-screen лише на lg+ — інакше 100vh перебиває --app-vvh і TabBar ховається під URL-бар.
      */}
      <div className="app-shell--vv flex w-full bg-background lg:min-h-screen">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 min-h-0 max-lg:overflow-hidden lg:min-h-screen">
          <Header className="hidden lg:flex shrink-0" />
          <MobileHeader />

          <main
            ref={mainRef}
            className="flex flex-col gap-6 px-0 py-4 md:px-3 lg:p-8 lg:pb-12 flex-1 min-h-0 max-lg:overflow-y-auto max-lg:overscroll-contain"
          >
            {!currentRoute?.hasOwnTitle && (
              <h1 className="text-primary font-inter text-2xl lg:text-3xl font-semibold leading-[100%] tracking-[-0.64px] min-h-10 flex items-center px-3 md:px-0">
                <span className="hidden lg:flex shrink-0">
                  {currentRoute?.icon && React.isValidElement(currentRoute.icon) && React.cloneElement(currentRoute.icon, {
                    className: `${currentRoute.icon.props?.className || ''} w-6 h-6 mr-3`.trim()
                  })}
                </span>
                {location.pathname.startsWith('/orders') && location.pathname.split('/').filter(Boolean).length > 1 && (
                <Button
                  color="secondary"
                  variant="flat"
                  className="text-neutral-500 min-w-fit mr-4"
                  onPress={() => navigate("/orders")}
                >
                  <DynamicIcon name="arrow-left" size={20} />
                </Button>
                )}
                {h1Title}
              </h1>
            )}
            {children}
          </main>

          <Footer className="hidden lg:block shrink-0" />
          <MobileTabBar />
        </div>
        
        <ServerStatusModal 
          isOpen={showModal}
          onClose={onCloseModal}
          isOffline={isOffline}
        />

        <UpdateNotificationBanner />
      </div>
    </SidebarProvider>
  );
}
