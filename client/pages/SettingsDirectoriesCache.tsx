import React from 'react';
import { DilovodCacheManager } from '../components/DilovodCacheManager';
import { SalesDriveCacheManager } from '../components/SalesDriveCacheManager';

const SettingsDirectoriesCache: React.FC = () => {
  return (
    <div className="grid grid-cols-1 gap-6">
      <DilovodCacheManager />
      <SalesDriveCacheManager />
    </div>
  );
};

export default SettingsDirectoriesCache;
