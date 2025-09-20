import { Tabs, Tab } from "@heroui/tabs";

interface TabsFilterProps {
  selectedTab: "confirmed" | "readyToShip" | "shipped" | "all" | "all_sum";
  onTabChange: (key: "confirmed" | "readyToShip" | "shipped" | "all" | "all_sum") => void;
  counts?: {
    confirmed: number;
    readyToShip: number;
    shipped: number;
    all: number;
  };
}

export function TabsFilter({ selectedTab, onTabChange, counts }: TabsFilterProps) {
  return (
    <Tabs
      selectedKey={selectedTab}
      onSelectionChange={(key) => {
        onTabChange(key as "confirmed" | "readyToShip" | "shipped" | "all" | "all_sum");
      }}
      variant="solid"
      color="default"
      size="lg"
      classNames={{
        // base: "w-full",
        tabList: "gap-2 p-[6px] bg-gray-100 rounded-lg w-full",
        cursor: "bg-secondary text-white shadow-sm rounded-md",
        tab: "px-3 py-1.5 text-sm font-normal flex-1 data-[hover-unselected=true]:opacity-100 text-neutral-500",
        tabContent: "group-data-[selected=true]:text-white text-neutral-400"
      }}
    >
      <Tab key="confirmed" title={`Підтверджені ${counts ? `(${counts.confirmed})` : ''}`} />
      <Tab key="readyToShip" title={`Готові до відправлення ${counts ? `(${counts.readyToShip})` : ''}`} />
      <Tab key="shipped" title={`Відправлені ${counts ? `(${counts.shipped})` : ''}`} />
      <Tab key="all_sum" title={`Всі ${counts ? `(${counts.all})` : ''}`} />
    </Tabs>
  );
}
