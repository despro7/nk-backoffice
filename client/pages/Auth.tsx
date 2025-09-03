import React from 'react';
import { LoginForm } from '../components/LoginForm';
import { useAuthRedirect } from '../hooks/useAuthRedirect';
// import { RegisterForm } from '../components/RegisterForm';

export const Auth: React.FC = () => {
  // const [isLogin, setIsLogin] = useState(true);
  
  // Хук для автоматического редиректа если пользователь уже авторизован
  useAuthRedirect();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* <div className="max-w-md mx-auto pt-8">
        <div className="flex justify-center space-x-4 mb-8">
          <button
            onClick={() => setIsLogin(true)}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              isLogin
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Вход
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              !isLogin
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Регистрация
          </button>
        </div>
      </div> */}
      
      {/* {isLogin ? <LoginForm /> : <RegisterForm />} */}
      <LoginForm />
    </div>
  );
};
