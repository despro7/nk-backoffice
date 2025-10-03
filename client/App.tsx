import "./global.css";

import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HeroUIProvider, ToastProvider } from "@heroui/react";
import NotFound from "./pages/NotFound";
import { appRoutes } from "./routes.config";
import { Layout } from "./components/Layout";
import { ScrollToTop } from "./components/ScrollToTop";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { DebugProvider } from "./contexts/DebugContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Auth } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TestSerialCom from "./pages/test-serial-com";
import { useEquipmentFromAuth } from "./contexts/AuthContext";
import { ToastService } from "./services/ToastService";
import { LoggingService } from "./services/LoggingService";
import ErrorBoundary from "./components/ErrorBoundary";
import { initAudioContext } from "./lib/soundUtils";

const queryClient = new QueryClient();

// Компонент для рендеринга маршрутов с поддержкой ключей
const AppRoutes = () => {
  const [equipmentState] = useEquipmentFromAuth();

  // Инициализация при загрузке приложения
  useEffect(() => {
    // ToastService автоматически инициализируется при первом использовании
  }, []);

  // Показываем загрузку, если состояние оборудования еще не инициализировано
  if (!equipmentState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Завантаження...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Страница авторизации без Layout */}
      <Route path="/auth" element={<Auth />} />

      {/* Главная страница */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout>
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      } />

      {/* Маршрут без авторизации для тестирования COM порта */}
      <Route path="/test-serial-com" element={
        <Layout>
          <TestSerialCom />
        </Layout>
      } />

      {/* Остальные защищенные роуты */}
      {appRoutes.slice(1).map((route) => {
        // Для OrderView добавляем key, зависящий от состояния оборудования
        const isOrderView = route.path === '/orders/:externalId';
        const key = isOrderView
          ? `order-view-${equipmentState.config?.scale?.connectionStrategy}`
          : route.path;

        return (
          <Route
            key={key}
            path={route.path}
            element={
              <ProtectedRoute>
                <Layout>
                  <route.component />
                </Layout>
              </ProtectedRoute>
            }
          />
        );
      })}

      {/* 404 страница */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};


// Компонент для глобальної ініціалізації сервісів (логування, toast)
const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = React.useState(false);
  const { user, isLoading: authLoading } = useAuth();

  // Инициализация AudioContext при первом пользовательском взаимодействии
  React.useEffect(() => {
    const handleFirstUserInteraction = () => {
      initAudioContext();
      // Удаляем обработчики после первого взаимодействия
      document.removeEventListener('click', handleFirstUserInteraction);
      document.removeEventListener('keydown', handleFirstUserInteraction);
      document.removeEventListener('touchstart', handleFirstUserInteraction);
    };

    // Добавляем обработчики для различных типов пользовательских взаимодействий
    document.addEventListener('click', handleFirstUserInteraction);
    document.addEventListener('keydown', handleFirstUserInteraction);
    document.addEventListener('touchstart', handleFirstUserInteraction);

    return () => {
      document.removeEventListener('click', handleFirstUserInteraction);
      document.removeEventListener('keydown', handleFirstUserInteraction);
      document.removeEventListener('touchstart', handleFirstUserInteraction);
    };
  }, []);

  React.useEffect(() => {
    (async () => {
      // Always initialize logging first
      await LoggingService.initialize();

      // Wait until AuthContext finished initial check
      if (authLoading) return;

      if (user) {
        // ToastService will be initialized by AuthContext when user is set.
      } else {
        // Apply local defaults to avoid 401 network requests
        ToastService.updateSettings({
          authSuccess: true,
          authErrors: true,
          tokenRefresh: true,
          tokenExpiry: true,
          apiErrors: true,
          equipmentStatus: true,
          systemNotifications: true,
        });
      }

      setIsReady(true);
    })();
  }, [authLoading, user]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Завантаження налаштувань застосунку...</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

const App = () => (
  <HeroUIProvider>
    <ToastProvider toastProps={{ radius: "md", shadow: "md" }} placement="bottom-right" toastOffset={30} />
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <DebugProvider>
            <AppInitializer>
              <ScrollToTop />
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </AppInitializer>
          </DebugProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </HeroUIProvider>
);

createRoot(document.getElementById("root")!).render(<App />);