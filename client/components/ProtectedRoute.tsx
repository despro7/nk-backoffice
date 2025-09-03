import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { hasAccess } from '../routes.config';

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
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    // Сохраняем текущий путь перед редиректом на /auth
    if (location.pathname !== '/auth' && location.pathname !== '/') {
      localStorage.setItem('lastVisitedPath', location.pathname);
    }
    return <Navigate to="/auth" replace />;
  }

  if (!hasAccess(user.role, requiredRoles, minRole)) {
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
