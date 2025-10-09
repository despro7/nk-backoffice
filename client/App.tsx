import "./global.css";

import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { appRoutes } from "./routes.config";
import { Layout } from "./components/Layout";
import { ScrollToTop } from "./components/ScrollToTop";
import { ProtectedRoute } from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { DebugProvider } from "./contexts/DebugContext";
import { useEquipmentFromAuth } from "./contexts/AuthContext";
import NotFound from "./pages/NotFound";
import { Auth } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TestSerialCom from "./pages/test-serial-com";
import { ToastService } from "./services/ToastService";
import { LoggingService } from "./services/LoggingService";
import { initAudioContext } from "./lib/soundUtils";

const queryClient = new QueryClient();

// Компонент для рендерінгу маршрутів із підтримкою ключів
const AppRoutes = () => {
  const [equipmentState] = useEquipmentFromAuth();

  // Ініціалізація під час завантаження застосунку
  useEffect(() => {
    // ToastService автоматично ініціалізується під час першого використання
  }, []);

  // Показуємо завантаження, якщо стан обладнання ще не ініціалізовано
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
      {/* Сторінка авторизації без Layout */}
      <Route path="/auth" element={<Auth />} />

      {/* Головна сторінка */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout>
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      } />

      {/* Маршрут без авторизації для тестування COM порту */}
      <Route path="/test-serial-com" element={
        <Layout>
          <TestSerialCom />
        </Layout>
      } />

      {/* Решта захищених роутів */}
      {appRoutes.slice(1).map((route) => {
        // Для OrderView додаємо key, що залежить від стану обладнання
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

      {/* 404 сторінка */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};


// Компонент для глобальної ініціалізації сервісів (логування, toast)
const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = React.useState(false);
  const { user, isLoading: authLoading } = useAuth();

  // Ініціалізація AudioContext під час першої користувацької взаємодії
  React.useEffect(() => {
    const handleFirstUserInteraction = () => {
      initAudioContext();
      // Видаляємо обробники після першої взаємодії
      document.removeEventListener('click', handleFirstUserInteraction);
      document.removeEventListener('keydown', handleFirstUserInteraction);
      document.removeEventListener('touchstart', handleFirstUserInteraction);
    };

    // Додаємо обробники для різних типів користувацьких взаємодій
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