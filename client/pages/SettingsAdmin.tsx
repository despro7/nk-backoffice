import React from 'react';
import { SettingsManager } from '../components/SettingsManager';
import { ServerStatusSettings } from '../components/ServerStatusSettings';
import { useRoleAccess } from '../hooks/useRoleAccess';

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
      {/* Настройки статуса сервера */}
      <section>
        <ServerStatusSettings />
      </section>

      {/* Общие настройки */}
      <section>
        <SettingsManager />
      </section>
    </div>
  );
};

export default SettingsAdmin;
