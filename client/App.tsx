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
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Auth } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TestSerialCom from "./pages/test-serial-com";
import { useEquipmentFromAuth } from "./contexts/AuthContext";
import { ToastService } from "./services/ToastService";

const queryClient = new QueryClient();

// Компонент для рендеринга маршрутов с поддержкой ключей
const AppRoutes = () => {
  const [equipmentState] = useEquipmentFromAuth();

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
          ? `order-view-${equipmentState.isSimulationMode}-${equipmentState.config?.connectionType}`
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

// Компонент для инициализации настроек
const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

const App = () => (
  <HeroUIProvider>
    <ToastProvider toastProps={{ radius: "md", shadow: "md" }} placement="bottom-right" toastOffset={30} />
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppInitializer>
            <ScrollToTop />
            <AppRoutes />
          </AppInitializer>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </HeroUIProvider>
);

createRoot(document.getElementById("root")!).render(<App />);