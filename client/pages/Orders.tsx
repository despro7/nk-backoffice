import { useState, useEffect } from "react";
import { OrdersTable } from "@/components/OrdersTable";
import { RightPanel } from "@/components/RightPanel";
import { SearchInput } from "@/components/SearchInput";
import { NumberPad } from "@/components/NumberPad";
import { DeviationButton } from "@/components/DeviationButton";
import { useApi } from "@/hooks/useApi";
import { LastSyncInfo } from "@/components/LastSyncInfo";


export default function Orders() {
  const [selectedTab, setSelectedTab] = useState<"confirmed" | "readyToShip" | "shipped" | "all" | "all_sum">("confirmed");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const { apiCall } = useApi();

  // Загружаем настройки таба из базы данных
  useEffect(() => {
    const loadDefaultTab = async () => {
      try {
        const response = await apiCall('/api/settings');
        if (response.ok) {
          const allSettings = await response.json();

          // Ищем настройку таба по умолчанию
          const defaultTabSetting = allSettings.find((s: any) => s.key === 'orders_default_tab');
          if (defaultTabSetting) {
            setSelectedTab(defaultTabSetting.value as "confirmed" | "readyToShip" | "shipped" | "all" | "all_sum");
          }
        }
      } catch (error) {
        console.error('Error loading default tab setting:', error);
        // Оставляем значение по умолчанию ("all")
      }
    };

    loadDefaultTab();
  }, []);

  const handleNumberClick = (number: string) => {
    setSearchQuery(searchQuery + number);
  };

  const handleBackspace = () => {
    setSearchQuery(searchQuery.slice(0, -1));
  };

  return (
    <div className="space-y-6 w-full">
      {/* Основной контент */}
      <div className="flex flex-col xl:flex-row items-start gap-8 w-full">
        {/* Left Column - Orders Table */}
        <div className="w-full max-w-5xl">
          <OrdersTable 
            filter={selectedTab}
            searchQuery={searchQuery}
            onTabChange={setSelectedTab}
          />
        </div>

        {/* Right Column - Control Panel */}
        <RightPanel className="pt-16">
          <LastSyncInfo />
          <SearchInput 
            value={searchQuery} 
            onChange={(value) => setSearchQuery(value)}
            placeholder="Пошук замовлення"
          />
          <NumberPad 
            onNumberClick={handleNumberClick}
            onBackspace={handleBackspace}
          />
          <DeviationButton />
        </RightPanel>
      </div>
    </div>
  );
}