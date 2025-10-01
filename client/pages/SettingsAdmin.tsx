import React from 'react';
import { SettingsManager } from '../components/SettingsManager';
import { ServerStatusSettings } from '../components/ServerStatusSettings';
import { UserRegistrationManager } from '../components/UserRegistrationManager';
import { LoggingSettings } from '../components/LoggingSettings';
import { ToastSettings } from '@/components/ToastSettings';
import { AuthSettings } from '../components/AuthSettings';
import { useRoleAccess } from '../hooks/useRoleAccess';
import { DateFormatSettings } from "@/components/DateFormatSettings";

const SettingsAdmin: React.FC = () => {
  const { isAdmin } = useRoleAccess();

  // Если пользователь не админ, не показываем страницу
  if (!isAdmin()) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Доступ заборонено</h2>
          <p className="text-gray-600">У вас немає прав доступу до цієї сторінки.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Реєстрація користувачів */}
      <section>
        <UserRegistrationManager />
      </section>

      {/* Налаштування логування і toast */}
      <section>
        <h2 className="text-2xl font-semibold mb-2">Налаштування логування</h2>
		    <p className="text-sm text-gray-600 mb-4">Керування консольними логами та Toast сповіщеннями</p>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Консольні логи */}
          <LoggingSettings />
          
          {/* Toast сповіщення */}
          <ToastSettings />
        </div>
      </section>

      {/* Налаштування авторизації */}
      <section>
        <AuthSettings />
      </section>

      {/* Налаштування статусу сервера */}
      <section>
        <ServerStatusSettings />
      </section>

      {/* Функція форматування дати */}
      <section>
        <DateFormatSettings />
      </section>

      {/* Загальні налаштування */}
      <section>
        <SettingsManager />
      </section>
    </div>
  );
};

export default SettingsAdmin;
