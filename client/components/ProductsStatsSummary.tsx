import { DynamicIcon } from 'lucide-react/dynamic';

export interface ProductsStats {
  totalProducts: number;
  activeProducts: number;
  outdatedProducts: number;
  totalSets: number;
  activeSets: number;
  outdatedSets: number;
  totalDishes: number;
  activeDishes: number;
  outdatedDishes: number;
  categoriesCount: Array<{
    name: string;
    count: number;
    activeCount: number;
  }>;
  activeCategoriesCount: number;
  lastSync?: string;
}

interface ProductsStatsSummaryProps {
  stats: ProductsStats | null;
  className?: string;
}

interface StatCardProps {
  label: string;
  iconName: string;
  iconColor: string;
  activeCount: number;
  totalCount: number;
  outdatedCount: number;
}

function StatCard({ label, iconName, iconColor, activeCount, totalCount, outdatedCount }: StatCardProps) {
  return (
    <div className="bg-white flex flex-col gap-2 p-4 rounded-xl shadow-sm min-w-[200px] flex-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#1e1b1b]">{label}</span>
        <DynamicIcon name={iconName as any} size={20} style={{ color: iconColor }} />
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-[32px] font-semibold text-[#1e1b1b] leading-none">{activeCount}</span>
        <span className="text-sm font-medium text-[#5aa44b]">активних</span>
      </div>
      <p className="text-xs text-[#a5a5a5]">
        {totalCount} всього / {outdatedCount} застарілих
      </p>
    </div>
  );
}

export default function ProductsStatsSummary({ stats, className }: ProductsStatsSummaryProps) {
  const totalCategories = stats?.categoriesCount?.length ?? 0;
  const activeCategories = stats?.activeCategoriesCount ?? 0;

  return (
    <div className={`flex flex-wrap gap-5 ${className ?? ''}`}>
      <StatCard
        label="Всі товари"
        iconName="shopping-basket"
        iconColor="#f64c15"
        activeCount={stats?.activeProducts ?? 0}
        totalCount={stats?.totalProducts ?? 0}
        outdatedCount={stats?.outdatedProducts ?? 0}
      />
      <StatCard
        label="Комплекти"
        iconName="package"
        iconColor="#4083e1"
        activeCount={stats?.activeSets ?? 0}
        totalCount={stats?.totalSets ?? 0}
        outdatedCount={stats?.outdatedSets ?? 0}
      />
      <StatCard
        label="Страви"
        iconName="utensils"
        iconColor="#38b351"
        activeCount={stats?.activeDishes ?? 0}
        totalCount={stats?.totalDishes ?? 0}
        outdatedCount={stats?.outdatedDishes ?? 0}
      />
      <StatCard
        label="Категорії"
        iconName="tag"
        iconColor="#c746ff"
        activeCount={activeCategories}
        totalCount={totalCategories}
        outdatedCount={totalCategories - activeCategories}
      />
    </div>
  );
}
