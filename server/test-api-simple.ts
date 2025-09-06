// Простий тест API без зовнішніх залежностей
async function testAPISimple() {
  console.log('🧪 Простий тест API налаштувань обладнання...\n');

  try {
    // 1. Тестування GET /api/settings/equipment
    console.log('1️⃣ Тестування GET /api/settings/equipment...');
    try {
      const response = await fetch('http://localhost:3001/api/settings/equipment', {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ GET /api/settings/equipment успішний');
        console.log('📋 Дані:', JSON.stringify(result, null, 2));
      } else {
        console.log(`⚠️  GET /api/settings/equipment повернув статус: ${response.status}`);
        const errorText = await response.text();
        console.log('📝 Помилка:', errorText);
      }
    } catch (error) {
      console.log('❌ GET /api/settings/equipment не вдався:', error.message);
    }
    console.log('');

    // 2. Тестування POST /api/settings/equipment
    console.log('2️⃣ Тестування POST /api/settings/equipment...');
    try {
      const testConfig = {
        connectionType: 'local',
        scale: {
          comPort: 'COM6',
          baudRate: 19200,
          dataBits: 8,
          stopBits: 1,
          parity: 'none'
        },
        scanner: {
          autoConnect: true,
          timeout: 3000
        },
        simulation: {
          enabled: false,
          weightRange: { min: 0.05, max: 10.0 },
          scanDelay: 500,
          weightDelay: 1000
        }
      };

      const response = await fetch('http://localhost:3001/api/settings/equipment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify(testConfig)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ POST /api/settings/equipment успішний');
        console.log('📋 Результат:', JSON.stringify(result, null, 2));
      } else {
        console.log(`⚠️  POST /api/settings/equipment повернув статус: ${response.status}`);
        const errorText = await response.text();
        console.log('📝 Помилка:', errorText);
      }
    } catch (error) {
      console.log('❌ POST /api/settings/equipment не вдався:', error.message);
    }

  } catch (error) {
    console.error('❌ Загальна помилка тестування:', error);
  }
}

// Запуск тестування
testAPISimple()
  .then(() => {
    console.log('\n🏁 Тестування API завершено');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Критична помилка:', error);
    process.exit(1);
  });
