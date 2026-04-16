import { useState, useEffect } from "react";
import { OrdersTable } from "@/components/OrdersTable";
import { RightPanel } from "@/components/RightPanel";
import { SearchInput } from "@/components/SearchInput";
import { NumberPad } from "@/components/NumberPad";
import { DeviationButton } from "@/components/DeviationButton";
import { useApi } from "@/hooks/useApi";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { LastSyncInfo } from "@/components/LastSyncInfo";
import { OrderInterfaceSettings } from "@/components/OrderInterfaceSettings";
import { Button, Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";


export default function Orders() {
  const [selectedTab, setSelectedTab] = useState<"confirmed" | "readyToShip" | "shipped" | "all" | "all_sum">("confirmed");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { apiCall } = useApi();
  const { isAdmin } = useRoleAccess();


  // Завантажуємо налаштування таба з бази даних
  useEffect(() => {
    const loadDefaultTab = async () => {
      try {
        const response = await apiCall('/api/settings');
        if (response.ok) {
          const allSettings = await response.json();

          // Шукаємо налаштування таба за замовчуванням
          const defaultTabSetting = allSettings.find((s: any) => s.key === 'orders_default_tab');
          if (defaultTabSetting) {
            setSelectedTab(defaultTabSetting.value as "confirmed" | "readyToShip" | "shipped" | "all" | "all_sum");
          }
        }
      } catch (error) {
        console.error('Error loading default tab setting:', error);
        // Залишаємо значення за замовчуванням ("all")
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
      {/* Основний контент */}
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
          {/* Пошук замовлень */}
          <SearchInput 
            value={searchQuery} 
            onChange={(value) => setSearchQuery(value)}
            placeholder="Пошук замовлення"
          />

          {/* Цифрова Num панель */}
          <NumberPad 
            onNumberClick={handleNumberClick}
            onBackspace={handleBackspace}
          />

          {/* Кнопка синхронізації замовлень */}
          <LastSyncInfo />

          {/* Кнопка відхилення */}
          <DeviationButton />

          {isAdmin() && (
          <Button
            variant="flat"
            size="md"
            className="bg-neutral-300/75 text-neutral-500 mx-auto"
            startContent={<DynamicIcon name="settings-2" />}
            onPress={() => setIsSettingsOpen(true)}
          >
            Налаштування інтерфейсу
          </Button>
          )}
        </RightPanel>
      </div>
      
      {/* Модальне вікно налаштувань інтерфейсу */}
      <Modal
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>Налаштування інтерфейсу замовлень</ModalHeader>
          <ModalBody className="pb-6">
            <OrderInterfaceSettings />
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}