# Фікс: скидання налаштувань обладнання

## Проблема

Налаштування обладнання (scale, scanner, printer) скидалися до дефолтних значень при частковому оновленні через два баги:

1. **Небезпечний cast** `Partial<Settings>` → `Settings` без merge з поточними значеннями
2. **Оператор `??`** при збереженні замінював `undefined` дефолтом, навіть якщо в БД вже було користувацьке значення

**Приклад:** користувач мав `dataBits: 7` в БД, викликав `updateScaleSettings({ baudRate: 4800 })` → `dataBits` скидалось до `8` (дефолт).

## Рішення — безпечний патерн

```typescript
// ПРАВИЛЬНО: читаємо поточні, мержимо, зберігаємо тільки наявні поля
async updateScaleSettings(partial: Partial<EquipmentSettings['scale']>): Promise<void> {
  const current = await this.getEquipmentSettings();
  const merged = { ...current.scale, ...partial };
  await this.saveScaleSettings(merged);
}

private async saveScaleSettings(settings: EquipmentSettings['scale']): Promise<void> {
  const list = [];
  if (settings.baudRate !== undefined) {
    list.push({ key: 'equipment_scale.baudRate', value: JSON.stringify(settings.baudRate) });
  }
  // ... інші поля аналогічно (БЕЗ ?? оператора!)
  if (list.length > 0) await this.batchUpsertSettings(list);
}

// НЕПРАВИЛЬНО
async updateScaleSettings(partial: Partial<Settings>): Promise<void> {
  await this.saveSettings(partial as Settings); // небезпечний cast!
}
private async saveSettings(s: Settings): Promise<void> {
  list.push({ key: 'baudRate', value: JSON.stringify(s.baudRate ?? 4800) }); // втрата даних!
}
```

## Правила (`server/services/settingsService.ts`)

1. НІКОЛИ не використовуй `??` з дефолтами при збереженні налаштувань
2. ЗАВЖДИ читай поточні налаштування перед частковим оновленням
3. ЗАВЖДИ перевіряй `!== undefined` перед збереженням поля
4. ЗАВЖДИ мержи `{ ...current, ...partial }` перед збереженням

## Змінені методи

- `updateScaleSettings()`, `updateScannerSettings()`, `updatePrinterSettings()` — читання + merge
- `saveScaleSettings()`, `saveScannerSettings()`, `savePrinterSettings()` — видалено `??`, перевірка `!== undefined`
- `saveOrderSoundSettings()` — фільтрація `undefined`
- `saveEquipmentSettings()` — перевірка наявності секцій перед збереженням
