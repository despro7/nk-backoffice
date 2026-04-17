import SalesDriveOrdersTable from "../components/SalesDriveOrdersTable";
import CashInImport from "./CashInImport";
import { DynamicIcon } from "lucide-react/dynamic";

export default function SalesDriveOrders() {
  return (
    <>
      <div className="container bg-white rounded-lg p-6">
        <p className="text-sm text-gray-600 mb-2">
          Моніторинг вивантаження замовлень з SalesDrive до Діловоду. Нижче наведено дані по замовленням, які були експортовані або очікують на експорт.
        </p>
        <p className="text-sm text-gray-600 mb-6">
          Дата <b>експорту</b> замовлення до Діловоду завжди = даті оформлення замовлення. Дата <b>відвантаження</b> до Діловоду оновлюється при завершенні комплектування замовлення в Backoffice. Але дата, яка відображається в інтерфейсі <span className={`w-5 h-5 inline-flex items-center justify-center box-border select-none rounded bg-purple-100 text-purple-600`}><DynamicIcon name="search-check" size={13} /></span> може відрізнятися від дати експорту, оскільки оновлюється при першій перевірці замовлення в Діловоді, а також при примусовій перевірці.
        </p>
        <SalesDriveOrdersTable />
      </div>

      <div className="container bg-white rounded-lg p-6 mt-4">
        <CashInImport />
      </div>
    </>
  );
}