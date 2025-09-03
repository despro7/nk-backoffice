import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDatabaseConnection() {
  console.log('🧪 Тестування підключення до бази даних...\n');

  try {
    // Тестуємо підключення
    await prisma.$connect();
    console.log('✅ Підключення до БД успішне');

    // Перевіряємо таблицю settings_base
    const settingsCount = await prisma.settingsBase.count();
    console.log(`📊 Кількість записів у таблиці settings_base: ${settingsCount}`);

    // Перевіряємо налаштування обладнання
    const equipmentSettings = await prisma.settingsBase.findMany({
      where: {
        category: 'equipment',
        isActive: true
      }
    });

    console.log(`🔧 Знайдено налаштувань обладнання: ${equipmentSettings.length}`);

    if (equipmentSettings.length > 0) {
      console.log('\n📋 Поточні налаштування обладнання:');
      equipmentSettings.forEach(setting => {
        console.log(`  - ${setting.key}: ${setting.value}`);
      });
    } else {
      console.log('\n⚠️  Налаштування обладнання не знайдено');
      
      // Створюємо тестові налаштування
      console.log('\n🔧 Створюємо тестові налаштування...');
      
      const testSettings = [
        {
          key: 'equipment_connectionType',
          value: 'simulation',
          category: 'equipment',
          description: 'Тип підключення обладнання',
          isActive: true
        },
        {
          key: 'equipment_scale.comPort',
          value: 'COM4',
          category: 'equipment',
          description: 'COM-порт ваг',
          isActive: true
        },
        {
          key: 'equipment_scale.baudRate',
          value: '9600',
          category: 'equipment',
          description: 'Швидкість передачі даних ваг',
          isActive: true
        }
      ];

      for (const setting of testSettings) {
        await prisma.settingsBase.create({
          data: setting
        });
        console.log(`  ✅ Створено: ${setting.key}`);
      }

      console.log('\n✅ Тестові налаштування створено');
    }

  } catch (error) {
    console.error('❌ Помилка підключення до БД:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск тестування
testDatabaseConnection()
  .then(() => {
    console.log('\n🏁 Тестування завершено');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Критична помилка:', error);
    process.exit(1);
  });
