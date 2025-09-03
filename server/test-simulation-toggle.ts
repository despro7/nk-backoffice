import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testSimulationToggle() {
  console.log('🧪 Тестування перемикання режиму симуляції...\n');

  try {
    // 1. Початковий стан
    console.log('1️⃣ Початковий стан налаштувань...');
    const initialSettings = await prisma.settingsBase.findMany({
      where: {
        category: 'equipment',
        isActive: true
      }
    });

    let connectionType = 'unknown';
    for (const setting of initialSettings) {
      if (setting.key === 'equipment_connectionType') {
        try {
          connectionType = JSON.parse(setting.value);
          console.log(`📋 Поточний тип підключення: ${connectionType}`);
        } catch (_error) {
          console.log(`❌ Помилка парсингу: ${setting.value}`);
        }
        break;
      }
    }

    // 2. Перемикаємо на режим симуляції
    console.log('\n2️⃣ Перемикання на режим симуляції...');
    await prisma.settingsBase.update({
      where: { key: 'equipment_connectionType' },
      data: { value: JSON.stringify('simulation') }
    });
    console.log('✅ Перемикаємо на режим симуляції');

    // 3. Перевіряємо зміни
    console.log('\n3️⃣ Перевірка змін...');
    const updatedSetting = await prisma.settingsBase.findUnique({
      where: { key: 'equipment_connectionType' }
    });

    if (updatedSetting) {
      try {
        const newConnectionType = JSON.parse(updatedSetting.value);
        console.log(`📋 Новий тип підключення: ${newConnectionType}`);
        
        if (newConnectionType === 'simulation') {
          console.log('✅ Режим симуляції успішно увімкнено!');
        } else {
          console.log('❌ Режим симуляції не увімкнено');
        }
      } catch (_error) {
        console.log(`❌ Помилка парсингу оновленого значення: ${updatedSetting.value}`);
      }
    }

    // 4. Перемикаємо на локальне обладнання
    console.log('\n4️⃣ Перемикання на локальне обладнання...');
    await prisma.settingsBase.update({
      where: { key: 'equipment_connectionType' },
      data: { value: JSON.stringify('local') }
    });
    console.log('✅ Перемикаємо на локальне обладнання');

    // 5. Фінальна перевірка
    console.log('\n5️⃣ Фінальна перевірка...');
    const finalSetting = await prisma.settingsBase.findUnique({
      where: { key: 'equipment_connectionType' }
    });

    if (finalSetting) {
      try {
        const finalConnectionType = JSON.parse(finalSetting.value);
        console.log(`📋 Фінальний тип підключення: ${finalConnectionType}`);
        
        if (finalConnectionType === 'local') {
          console.log('✅ Локальне обладнання успішно увімкнено!');
        } else {
          console.log('❌ Локальне обладнання не увімкнено');
        }
      } catch (_error) {
        console.log(`❌ Помилка парсингу фінального значення: ${finalSetting.value}`);
      }
    }

    // 6. Повертаємо початковий стан
    console.log('\n6️⃣ Повернення початкового стану...');
    await prisma.settingsBase.update({
      where: { key: 'equipment_connectionType' },
      data: { value: JSON.stringify(connectionType) }
    });
    console.log(`✅ Повертаємо початковий тип підключення: ${connectionType}`);

    console.log('\n🎉 Тест перемикання режиму симуляції завершено успішно!');

  } catch (error) {
    console.error('❌ Помилка під час тестування:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск тестування
testSimulationToggle()
  .then(() => {
    console.log('\n🏁 Тестування завершено');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Критична помилка:', error);
    process.exit(1);
  });
