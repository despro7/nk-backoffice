import React from 'react';
import { WeightToleranceSettings } from '../components/WeightToleranceSettings';
import { BoxSettingsManager } from '../components/BoxSettingsManager';
import { OrderInterfaceSettings } from '../components/OrderInterfaceSettings';
import { OrderSoundSettingsCard } from '@/components/OrderSoundSettingsCard';

const SettingsOrderAssembly: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <OrderInterfaceSettings />
          <OrderSoundSettingsCard />
        </div>
          <WeightToleranceSettings />
      </div>

      {/* Настройки коробок */}
      <section className='mt-10'>
        <BoxSettingsManager />
      </section>
    </div>
  );
};

export default SettingsOrderAssembly;
