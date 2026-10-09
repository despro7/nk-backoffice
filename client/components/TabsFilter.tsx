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

const TAB_CLASS_NAMES = "bg-default/20 px-1 py-[1px] ml-0.5 inline-block min-w-5 text-center font-medium rounded";

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
        tabList: "gap-2 p-[6px] bg-gray-100 rounded-lg w-full",
        cursor: "bg-slate-600 text-white shadow-sm rounded-md",
        tab: "px-3 py-1.5 text-sm font-normal flex-1 data-[hover-unselected=true]:opacity-100",
        tabContent: "group-data-[selected=true]:text-white text-neutral-500"
      }}
    >
      <Tab
        key="confirmed"
        title={
          <>Підтверджені {counts && <span className={TAB_CLASS_NAMES}>{counts.confirmed}</span>}</>
        }
      />
      <Tab
        key="readyToShip"
        title={
          <>Готові до відправки {counts && <span className={TAB_CLASS_NAMES}>{counts.readyToShip}</span>}</>
        }
      />
      <Tab
        key="shipped"
        title={
          <>Відправлені {counts && <span className={TAB_CLASS_NAMES}>{counts.shipped}</span>}</>
        }
      />
      <Tab
        key="all_sum"
        title={
          <>Всі {counts && <span className={TAB_CLASS_NAMES}>{counts.all}</span>}</>
        }
      />
    </Tabs>
  );
}
