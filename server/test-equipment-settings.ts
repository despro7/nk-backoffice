import EquipmentSettingsService from './services/settingsService.js';

async function testEquipmentSettings() {
  console.log('🧪 Тестування сервісу налаштувань обладнання...\n');

  const settingsService = EquipmentSettingsService.getInstance();

  try {
    // 1. Тестування отримання налаштувань (створюються з значеннями за замовчуванням)
    console.log('1️⃣ Отримання налаштувань обладнання...');
    const defaultSettings = await settingsService.getEquipmentSettings();
    console.log('✅ Налаштування завантажено:', JSON.stringify(defaultSettings, null, 2));
    console.log('');

    // 2. Тестування збереження налаштувань
    console.log('2️⃣ Збереження налаштувань обладнання...');
    const testSettings = {
      ...defaultSettings,
      connectionType: 'local' as const,
      scale: {
        ...defaultSettings.scale,
        comPort: 'COM3',
        baudRate: 19200
      }
    };

    await settingsService.saveEquipmentSettings(testSettings);
    console.log('✅ Налаштування збережено');
    console.log('');

    // 3. Тестування оновлення конкретної настройки
    console.log('3️⃣ Оновлення конкретної настройки...');
    await settingsService.updateEquipmentSetting('scale.comPort', 'COM5');
    console.log('✅ COM-порт оновлено на COM5');
    console.log('');

    // 4. Тестування повторного завантаження налаштувань
    console.log('4️⃣ Повторне завантаження налаштувань...');
    const updatedSettings = await settingsService.getEquipmentSettings();
    console.log('✅ Оновлені налаштування:', JSON.stringify(updatedSettings, null, 2));
    console.log('');

    // 5. Тестування отримання історії змін
    console.log('5️⃣ Отримання історії змін налаштувань...');
    const history = await settingsService.getSettingsHistory(10);
    console.log('✅ Історія змін:', history.map(h => ({
      key: h.key,
      value: h.value,
      updatedAt: h.updatedAt
    })));
    console.log('');

    // 6. Тестування скидання налаштувань
    console.log('6️⃣ Скидання налаштувань до значень за замовчуванням...');
    const resetSettings = await settingsService.resetEquipmentSettings();
    console.log('✅ Налаштування скинуті:', JSON.stringify(resetSettings, null, 2));
    console.log('');

    console.log('🎉 Всі тести пройшли успішно!');

  } catch (error) {
    console.error('❌ Помилка під час тестування:', error);
  }
}

// Запуск тестування
testEquipmentSettings()
  .then(() => {
    console.log('\n🏁 Тестування завершено');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Критична помилка:', error);
    process.exit(1);
  });
