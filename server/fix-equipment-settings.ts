import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixEquipmentSettings() {
  console.log('🔧 Виправлення налаштувань обладнання в БД...\n');

  try {
    // Отримуємо всі налаштування обладнання
    const equipmentSettings = await prisma.settingsBase.findMany({
      where: {
        category: 'equipment',
        isActive: true
      }
    });

    console.log(`📋 Знайдено ${equipmentSettings.length} налаштувань обладнання`);

    // Виправляємо кожну настройку
    for (const setting of equipmentSettings) {
      let newValue = setting.value;
      
      // Перевіряємо, чи значення вже є JSON
      try {
        JSON.parse(setting.value);
        console.log(`✅ ${setting.key}: вже є валідним JSON`);
        continue;
      } catch {
        // Значення не є JSON, виправляємо
        if (setting.key === 'equipment_connectionType') {
          // Для типу підключення додаємо кавички
          newValue = `"${setting.value}"`;
        } else if (setting.key === 'equipment_scale.comPort' || setting.key === 'equipment_scale.parity') {
          // Для строкових значень додаємо кавички
          newValue = `"${setting.value}"`;
        } else if (setting.key === 'equipment_scale.baudRate' || setting.key === 'equipment_scale.dataBits' || setting.key === 'equipment_scale.stopBits') {
          // Для числових значень залишаємо як є
          newValue = setting.value;
        } else if (setting.key === 'equipment_scanner.autoConnect') {
          // Для булевих значень конвертуємо
          newValue = setting.value === 'true' ? 'true' : 'false';
        } else if (setting.key === 'equipment_scanner.timeout') {
          // Для числових значень залишаємо як є
          newValue = setting.value;
        } else {
          // Для інших значень додаємо кавички
          newValue = `"${setting.value}"`;
        }

        // Оновлюємо настройку
        await prisma.settingsBase.update({
          where: { id: setting.id },
          data: { value: newValue }
        });

        console.log(`🔧 ${setting.key}: "${setting.value}" -> ${newValue}`);
      }
    }

    console.log('\n✅ Всі налаштування виправлено!');

    // Перевіряємо результат
    const updatedSettings = await prisma.settingsBase.findMany({
      where: {
        category: 'equipment',
        isActive: true
      }
    });

    console.log('\n📋 Оновлені налаштування:');
    for (const setting of updatedSettings) {
      try {
        const parsedValue = JSON.parse(setting.value);
        console.log(`  - ${setting.key}: ${JSON.stringify(parsedValue)}`);
      } catch (error) {
        console.log(`  - ${setting.key}: ${setting.value} (помилка парсингу)`);
      }
    }

  } catch (error) {
    console.error('❌ Помилка виправлення налаштувань:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск виправлення
fixEquipmentSettings()
  .then(() => {
    console.log('\n🏁 Виправлення завершено');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Критична помилка:', error);
    process.exit(1);
  });
