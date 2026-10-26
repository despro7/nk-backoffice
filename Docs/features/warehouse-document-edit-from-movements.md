# Редагування / перегляд документів з drawer рухів

**Дата:** 2026-10-26  
**Контекст:** звіт «Рухи по товару», drawer рухів (`ProductMovementsTable`)  
**Дозволи:** `warehouseDocumentEditPermissions.ts` (узгоджено зі сторінками складу + звіт відвантажень)

---

## Огляд

Клік по назві документа в таблиці рухів відкриває **другий nested drawer** (`stackLevel=1`, `ResizableAppDrawer`) з UI, узгодженим із відповідними сторінками складу. Тип документа визначається за підписом рядка (`documentLabel`) і опційно `documentTypeId` — `shared/utils/warehouseDocumentKind.ts`.

| Kind | Поведінка |
| --- | --- |
| `goodMoving` | Редагування переміщення v2 (`MovementV2DilovodEditDrawer`), без окремого context API |
| `release` | Комплектація / розукомплектування — `ReleaseItemsPanel`, `WarehouseDetails`, збереження через `useReleaseSets` |
| `writeOff` / `surplus` | Списання / оприбуткування — `WriteOffItemsPanel`, `ReasonSelector`, `ActionsBar` |
| `saleReturn` | Повернення — картки як на `/warehouse/returns`, `ReturnsItemRow` (перегляд) |
| `shipment` | **Лише перегляд** — `OrderDetailsContent` (як деталі замовлення зі стану замовлення) |
| `unknown` | Fallback: таблична частина Dilovod (`DilovodDocumentViewSections`, без сирого header) |

Якщо документ проводився через backoffice і є запис у БД з цим Dilovod ID — доступне редагування (крім відвантаження та перегляду повернення в drawer). Інакше показується таблиця `tpGoods` з Діловода.

---

## API

`GET /api/warehouse/document-edit/:dilovodDocumentId`

Query (опційно):

- `documentLabel` — підпис з регістру рухів (для resolver kind і пошуку замовлення)
- `documentTypeId` — id типу документа Dilovod

Відповідь: `WarehouseDocumentEditContextResponse` (`shared/types/warehouseDocumentEdit.ts`):

- `kind`, `dilovod` — snapshot `getObject` (для переміщення спочатку `MovementHistoryService.getMovementDetails`)
- `local` / `localRecord` — прив’язка до `warehouseWriteOffHistory`, `warehouseSurplusHistory`, `warehouseReleaseSet`, `warehouseReturnHistory`
- `shipmentOrder` — для `shipment`: повне замовлення з `orders` (дати, `rawData`, `items`, `payloadData.shipment`)

Сервіс: `server/modules/Warehouse/WarehouseDocumentEditContextService.ts`.

### Пошук замовлення для відвантаження

1. `header.baseDoc` / `contract` → `orders.dilovodDocId` (id з об’єкта Dilovod, не `[object Object]`)
2. Номер з `pr` («Замовлення 25557»)
3. Номер з `documentLabel` або regex у підписі

---

## Клієнт

| Шар | Файли |
| --- | --- |
| Контекст | `WarehouseDocumentEditDrawerProvider`, `useWarehouseDocumentEditDrawer` |
| Роутинг drawer | `WarehouseDocumentEditDrawer.tsx` |
| API | `fetchWarehouseDocumentEditContext.ts` |
| UI по типах | `*DilovodEditDrawer.tsx`, `ShipmentDocumentViewPanel.tsx`, `DilovodDocumentViewSections.tsx` |
| Деталі замовлення (спільно) | `client/components/order-details/OrderDetailsContent.tsx` |

Ширина drawer: `localStorage` ключ `warehouse-document-edit-drawer-width-v1` (640–1200 px, default 920).

---

## Зв’язок із рухами по товару

- Згортання дробових рядків комплектації в одному документі: `shared/utils/productMovementCollapse.ts` (лише документи з «комплектац» / «розукомплект» у підписі; ключ `id|label|date`).
- Нормалізація кількості в UI: `productMovementQty.ts`, `formatQty` у `productMovementsUtils.ts`.

Див. також [`product-movements.md`](product-movements.md), [`order-details-result-drawer.md`](order-details-result-drawer.md).
