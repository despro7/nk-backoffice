# Dynamic Monolithic, `payloadData` і lock для відвантажень

Ця нотатка описує зміни з коміту `afe91c8c21aecce3501fcb27609847d6075de5e7`, які зв'язали монолітні набори, payload замовлення та захист від дубльованих відвантажень у Dilovod.

## Що додано

- `dynamicMonolithic?: boolean` у `OrderChecklistItem` для окремого позначення динамічно-монолітних комплектів.
- `payloadData` у моделі `Order` для збереження додаткового payload по замовленню.
- `dilovodSaleExportLockUntil` і `dilovodSaleExportLockToken` у `Order` для захисту від дублювання shipment export.
- `dilovodDocId` у `WarehouseReleaseSet` для зв'язку локального випуску з документом у Dilovod.

## Як це працює

### 1. Монолітні набори

У `OrderView` і `orderAssemblyUtils` набір може бути відображений як монолітний або розгорнутий у звичайний список компонентів. Для цього використовується окремий стан управління відображенням, а `OrderChecklistItem` отримує `dynamicMonolithic` як ознаку для логіки зборки.

### 2. `payloadData` в `OrderView`

У `OrderView` payload не береться напряму з інпуту, а збирається як похідний стан `shipmentPayloadData`:

```ts
const shipmentPayloadData = useMemo(() => {
	const bySku = expandedItems.reduce<Record<string, { accGood: string; quantity: number }>>((accumulator, item) => {
		if (item.type !== 'product' || !item.sku || !item.dynamicMonolithic) {
			return accumulator;
		}

		const quantity = Number(item.quantity) || 0;
		if (quantity <= 0) {
			return accumulator;
		}

		const existing = accumulator[item.sku] ?? { accGood: '1119000000001079', quantity: 0 };
		accumulator[item.sku] = {
			accGood: '1119000000001079',
			quantity: existing.quantity + quantity,
		};
		return accumulator;
	}, {});

	return Object.keys(bySku).length > 0 ? { shipment: { bySku } } : null;
}, [expandedItems]);
```

Фактична форма payload така:

```json
{
	"shipment": {
		"bySku": {
			"SKU-001": {
				"accGood": "1119000000001079",
				"quantity": 2
			}
		}
	}
}
```

Цей payload потім передається в `useOrderNavigation`, а на сервері може бути збережений через `PUT /api/orders/:id/status`.

### 3. Payload замовлення

`PUT /api/orders/:id/status` тепер може приймати `payloadData` і зберігати його в БД. Це дозволяє передавати додаткові shipment-дані, зокрема мапінг за SKU, який використовується для списання залишків по монолітних наборах.

### 4. Списання залишків

Коли замовлення переходить у готовність до відправки, сервер читає `payloadData.shipment.bySku` і формує атомарні оновлення залишків. Це потрібно для сценаріїв, де комплект складається з фактично зібраних позицій, а не лише з абстрактної кількості комплектів.

### 5. Як перевикористати в інших місцях

Так, цей підхід можна застосовувати і в інших місцях, але краще не копіювати його вручну, а винести в спільний хелпер або hook.

Що вже є добрим кандидатом на reuse:

- фільтр `item.type === 'product' && item.dynamicMonolithic`;
- агрегація `bySku` з підсумовуванням `quantity`;
- структура `{ shipment: { bySku } }`;
- fallback на `null`, якщо payload порожній.

Практично це можна винести у щось на кшталт:

- `buildShipmentPayloadFromExpandedItems(expandedItems)`;
- або `useShipmentPayloadData(expandedItems)`.

Тоді його можна буде використовувати не лише в `OrderView`, а й у:

- окремих action-центрах або панелях;
- ручних статусних переходах;
- інших флоу, де потрібно віддати той самий shipment payload у `PUT /api/orders/:id/status`.

### 6. Shipment lock

Для експорту продажів у Dilovod додано lock-механізм, щоб один і той самий shipment не створювався двічі паралельними процесами. Лок зберігається в `Order` з TTL і токеном власника.

## Де дивитись у коді

- `client/components/OrderChecklistItem.tsx`
- `client/components/OrderAssemblyRightPanel.tsx`
- `client/lib/orderAssemblyUtils.ts`
- `client/pages/OrderView.tsx`
- `server/routes/orders.ts`
- `server/modules/Warehouse/SetReleaseController.ts`
- `server/services/dilovod/DilovodShipmentLockService.ts`
- `prisma/schema.prisma`

## Навіщо це потрібно

- щоб монолітні набори можна було окремо позначати як такі, що пакуються самостійно;
- щоб замовлення могло нести розширений payload для downstream-операцій;
- щоб списання залишків по shipment було передбачуваним і атомарним;
- щоб уникати дубльованих відвантажень у Dilovod.