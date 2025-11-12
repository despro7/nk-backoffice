import React from 'react';
import SalesDriveOrdersTable from "../components/SalesDriveOrdersTable";

export default function SalesDriveOrders() {
  return (
    <>
      <div className="bg-white rounded-lg p-6">
        <p className="text-sm text-gray-600 mb-6">
          Моніторинг вивантаження замовлень з SalesDrive до Діловоду. Нижче наведено дані по замовленням, які були експортовані або очікують на експорт.
        </p>
        <SalesDriveOrdersTable />
      </div>
    </>
  );
}