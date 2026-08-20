import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRolePreview } from '../contexts/RolePreviewContext';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { findAppRouteByPath } from '../routes.config';
import { canAccessRoute } from '@shared/constants/permissions';
import { LoggingService } from '../services/LoggingService';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
  minRole?: string;
  fallbackPath?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles,
  minRole,
  fallbackPath = "/"
}) => {
  const { user, isLoading } = useAuth();
  const { effectiveRole, isPreviewing, effectivePermissions } = useRolePreview();
  const location = useLocation();
  const navigate = useNavigate();

  if (process.env.NODE_ENV === 'development') {
    LoggingService.routeLog('🔒 [ProtectedRoute] checking access for:', location.pathname);
  }

  // Следим за изменениями состояния пользователя
  useEffect(() => {
    // console.log('👀 [ProtectedRoute] useEffect triggered, user:', user, 'pathname:', location.pathname);

    // Если пользователь только что авторизовался и мы на странице /auth, редиректим
    if (user && location.pathname === '/auth') {
      const lastVisitedPath = localStorage.getItem('lastVisitedPath') || '/';
      if (process.env.NODE_ENV === 'development') {
        LoggingService.routeLog('🚀 [ProtectedRoute] User authenticated, redirecting to:', lastVisitedPath);
      }
      navigate(lastVisitedPath, { replace: true });
      localStorage.removeItem('lastVisitedPath');
    }
  }, [user, location.pathname, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    if (process.env.NODE_ENV === 'development') {
      LoggingService.routeLog('🚫 [ProtectedRoute] User not authenticated, redirecting to /auth');
    }
    // Сохраняем текущий путь перед редиректом на /auth
    if (location.pathname !== '/auth' && location.pathname !== '/') {
      localStorage.setItem('lastVisitedPath', location.pathname);
    }
    return <Navigate to="/auth" replace />;
  }

  if (process.env.NODE_ENV === 'development') {
    LoggingService.routeLog('✅ [ProtectedRoute] User authenticated, rendering children');
  }

  const currentRoute = findAppRouteByPath(location.pathname);
  const routeRoles = requiredRoles ?? currentRoute?.roles;
  const routeMinRole = minRole ?? currentRoute?.minRole;

  if (!canAccessRoute(effectivePermissions, {
    permission: currentRoute?.permission,
    roles: routeRoles,
    minRole: routeMinRole,
  }, effectiveRole || user.role)) {
    if (isPreviewing) {
      return <Navigate to={fallbackPath} replace />;
    }

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Доступ заборонено</h1>
          <p className="text-gray-600">
            У вас недостатньо прав для доступу до цієї сторінки.
          </p>
          <button 
            onClick={() => window.history.back()} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Назад
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
