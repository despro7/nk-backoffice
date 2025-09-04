import React from 'react';
import { WeightToleranceSettings } from '../components/WeightToleranceSettings';
import { SettingsManager } from '../components/SettingsManager';
import { BoxSettingsManager } from '../components/BoxSettingsManager';
import { OrderInterfaceSettings } from '../components/OrderInterfaceSettings';
import { useRoleAccess } from '../hooks/useRoleAccess';

const SettingsOrderAssembly: React.FC = () => {
  const { isAdmin } = useRoleAccess();
  return (
    <div className="space-y-8">
      {/* Первая строка: настройки заказов слева, настройки веса справа */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <OrderInterfaceSettings />
        <WeightToleranceSettings />
      </div>

      {/* Настройки коробок */}
      <section>
        <BoxSettingsManager />
      </section>

    </div>
  );
};

export default SettingsOrderAssembly;
