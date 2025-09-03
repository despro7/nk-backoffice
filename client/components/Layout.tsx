import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { appRoutes } from "@/routes.config";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@heroui/button";
import { DynamicIcon } from "lucide-react/dynamic";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

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

  return (
    <div className="flex w-full min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <Header />
        <main className="flex flex-col gap-6 p-8 pb-12 flex-1">
          <h1 className="text-primary font-inter text-3xl font-semibold leading-[100%] tracking-[-0.64px] h-10 flex items-center">
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
          {children}
        </main>
      </div>
    </div>
  );
}