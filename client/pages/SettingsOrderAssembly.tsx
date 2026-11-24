import React from 'react';
import { WeightToleranceSettings } from '../components/WeightToleranceSettings';
import { BoxSettingsManager } from '../components/BoxSettingsManager';
import { OrderAssemblySettings } from '../components/OrderAssemblySettings';
import { OrderSoundSettingsCard } from '@/components/OrderSoundSettingsCard';
import { ShippingProvidersManager } from '../components/ShippingProvidersManager';
import { InventoryHistoryCacheSettings } from '../components/InventoryHistoryCacheSettings';

const SettingsOrderAssembly: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <OrderAssemblySettings />
        <div className="space-y-8">
          <WeightToleranceSettings />
          <OrderSoundSettingsCard />
          <InventoryHistoryCacheSettings />
        </div>
      </div>

      {/* Настройки коробок */}
      <section className='mt-10'>
        <BoxSettingsManager />
      </section>

      {/* Провайдери доставки */}
      <section className='mt-10'>
        <ShippingProvidersManager />
      </section>
    </div>
  );
};

export default SettingsOrderAssembly;
