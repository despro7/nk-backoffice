import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useServerStatus } from '../hooks/useServerStatus';
import logo from '/logo.svg';
import { Alert } from '@heroui/react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const { isOnline } = useServerStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const loginSuccess = await login({ email, password });
      if (loginSuccess) {
        // Проверяем сохраненный путь и перенаправляем туда
        const lastVisited = localStorage.getItem('lastVisitedPath');
        const redirectTo = lastVisited || '/';
        
        console.log(`🔄 [LoginForm] Успешный логин, перенаправляем на ${redirectTo}`);
        
        // Очищаем сохраненный путь после использования
        if (lastVisited) {
          localStorage.removeItem('lastVisitedPath');
        }
        
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <img src={logo} alt="logo" className="w-50 mx-auto mb-10" />
        </div>

        {/* Server Status Alert */}
        {!isOnline && (
        
        <Alert
          title="Сервер недоступний"
          description={<>Зверніться до адміністратора в телеграм: <a href="https://t.me/despro7" target="_blank">@despro7</a></>}
          color="danger"
          variant="faded"
          hideIcon={true}
          startContent={
            <DynamicIcon name="alert-triangle" size={20} />
          }
          classNames={{
            title: 'font-bold',
          }}
        />
        )}

        <form className="mt-8 space-y-8" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-lg -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none bg-white rounded-none relative block w-full p-4 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-lg"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Пароль
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none bg-white rounded-none relative block w-full p-4 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-lg"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading || !isOnline}
              className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-lg font-medium rounded-md text-white bg-gradient-to-r from-green-400 to-blue-500 hover:from-blue-500 hover:to-purple-500 transition-colors duration-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? 'Вхід...' : !isOnline ? 'Сервер недоступний' : 'Увійти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
