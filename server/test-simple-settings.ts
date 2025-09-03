import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testSimpleSettings() {
  console.log('🧪 Простий тест налаштувань обладнання...\n');

  try {
    // 1. Отримуємо налаштування
    console.log('1️⃣ Отримання налаштувань обладнання...');
    const settings = await prisma.settingsBase.findMany({
      where: {
        category: 'equipment',
        isActive: true
      }
    });

    console.log(`📋 Знайдено ${settings.length} налаштувань`);
    
    // Парсимо налаштування
    const parsedSettings: any = {};
    
    for (const setting of settings) {
      try {
        const value = JSON.parse(setting.value);
        const key = setting.key.replace('equipment_', '');
        
        if (key.includes('.')) {
          const [section, field] = key.split('.');
          if (!parsedSettings[section]) {
            parsedSettings[section] = {};
          }
          parsedSettings[section][field] = value;
        } else {
          parsedSettings[key] = value;
        }
        
        console.log(`✅ ${setting.key}: ${JSON.stringify(value)}`);
      } catch (_error) {
        console.log(`❌ ${setting.key}: ${setting.value} (помилка парсингу)`);
      }
    }

    console.log('\n📋 Парсовані налаштування:');
    console.log(JSON.stringify(parsedSettings, null, 2));

    // 2. Тестуємо збереження нових налаштувань
    console.log('\n2️⃣ Тестування збереження нових налаштувань...');
    
    const newSettings = {
      connectionType: 'websocket',
      scale: {
        comPort: 'COM5',
        baudRate: 19200
      }
    };

    // Зберігаємо нові налаштування
    for (const [key, value] of Object.entries(newSettings)) {
      if (typeof value === 'object') {
        for (const [subKey, subValue] of Object.entries(value)) {
          const dbKey = `equipment_${key}.${subKey}`;
          const dbValue = JSON.stringify(subValue);
          
          await prisma.settingsBase.upsert({
            where: { key: dbKey },
            update: { value: dbValue },
            create: {
              key: dbKey,
              value: dbValue,
              category: 'equipment',
              description: `Equipment setting: ${key}.${subKey}`,
              isActive: true
            }
          });
          
          console.log(`💾 Збережено: ${dbKey} = ${dbValue}`);
        }
      } else {
        const dbKey = `equipment_${key}`;
        const dbValue = JSON.stringify(value);
        
        await prisma.settingsBase.upsert({
          where: { key: dbKey },
          update: { value: dbValue },
          create: {
            key: dbKey,
            value: dbValue,
            category: 'equipment',
            description: `Equipment setting: ${key}`,
            isActive: true
          }
        });
        
        console.log(`💾 Збережено: ${dbKey} = ${dbValue}`);
      }
    }

    // 3. Перевіряємо оновлені налаштування
    console.log('\n3️⃣ Перевірка оновлених налаштувань...');
    const updatedSettings = await prisma.settingsBase.findMany({
      where: {
        category: 'equipment',
        isActive: true
      }
    });

    console.log(`📋 Всього налаштувань: ${updatedSettings.length}`);
    
    const finalParsedSettings: any = {};
    
    for (const setting of updatedSettings) {
      try {
        const value = JSON.parse(setting.value);
        const key = setting.key.replace('equipment_', '');
        
        if (key.includes('.')) {
          const [section, field] = key.split('.');
          if (!finalParsedSettings[section]) {
            finalParsedSettings[section] = {};
          }
          finalParsedSettings[section][field] = value;
        } else {
          finalParsedSettings[key] = value;
        }
      } catch (_error) {
        console.log(`❌ Помилка парсингу ${setting.key}: ${setting.value}`);
      }
    }

    console.log('\n📋 Фінальні налаштування:');
    console.log(JSON.stringify(finalParsedSettings, null, 2));

    console.log('\n🎉 Тест завершено успішно!');

  } catch (error) {
    console.error('❌ Помилка під час тестування:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск тестування
testSimpleSettings()
  .then(() => {
    console.log('\n🏁 Тестування завершено');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Критична помилка:', error);
    process.exit(1);
  });
