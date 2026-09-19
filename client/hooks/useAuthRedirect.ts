import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';

const LAST_VISITED_KEY = 'lastVisitedPath';
const DEFAULT_REDIRECT = '/';

export const useAuthRedirect = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Сохраняем последнюю посещенную страницу (кроме /auth)
  useEffect(() => {
    if (user && location.pathname !== '/auth' && location.pathname !== '/') {
      localStorage.setItem(LAST_VISITED_KEY, location.pathname);
    }
  }, [location.pathname, user]);

  // Редиректим с /auth если пользователь уже авторизован
  useEffect(() => {
    if (!isLoading && user && location.pathname === '/auth') {
      const lastVisited = localStorage.getItem(LAST_VISITED_KEY);
      const redirectTo = lastVisited || DEFAULT_REDIRECT;
      
      console.log(`🔄 [AuthRedirect] Пользователь авторизован, редиректим с /auth на ${redirectTo}`);
      
      // Очищаем сохраненный путь после использования
      if (lastVisited) {
        localStorage.removeItem(LAST_VISITED_KEY);
      }
      
      navigate(redirectTo, { replace: true });
    }
  }, [user, isLoading, location.pathname, navigate]);

  // Сохраняем текущий путь при переходе на /auth (если пользователь не авторизован)
  const saveCurrentPathAndRedirectToAuth = () => {
    if (location.pathname !== '/auth' && location.pathname !== '/') {
      localStorage.setItem(LAST_VISITED_KEY, location.pathname);
    }
    navigate('/auth', { replace: true });
  };

  return {
    saveCurrentPathAndRedirectToAuth,
    getLastVisitedPath: () => localStorage.getItem(LAST_VISITED_KEY) || DEFAULT_REDIRECT,
    clearLastVisitedPath: () => localStorage.removeItem(LAST_VISITED_KEY)
  };
};
