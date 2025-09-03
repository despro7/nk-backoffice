import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001'; // Порт вашего сервера
const TEST_TOKEN = 'test-token'; // Тестовый токен

async function testAPIEndpoints() {
  console.log('🧪 Тестування API endpoints налаштувань обладнання...\n');

  try {
    // 1. Тестування GET /api/settings/equipment
    console.log('1️⃣ Тестування GET /api/settings/equipment...');
    try {
      const response = await fetch(`${BASE_URL}/api/settings/equipment`, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`
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
        connectionType: 'websocket',
        scale: {
          comPort: 'COM5',
          baudRate: 19200,
          dataBits: 8,
          stopBits: 1,
          parity: 'none'
        },
        scanner: {
          autoConnect: true,
          timeout: 3000
        },
        websocket: {
          url: 'ws://192.168.1.100:8080/equipment',
          autoReconnect: true,
          reconnectInterval: 3000,
          maxReconnectAttempts: 5,
          heartbeatInterval: 15000
        },
        simulation: {
          enabled: false,
          weightRange: { min: 0.05, max: 10.0 },
          scanDelay: 500,
          weightDelay: 1000
        }
      };

      const response = await fetch(`${BASE_URL}/api/settings/equipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_TOKEN}`
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
    console.log('');

    // 3. Тестування PATCH /api/settings/equipment/:key
    console.log('3️⃣ Тестування PATCH /api/settings/equipment/scale.comPort...');
    try {
      const response = await fetch(`${BASE_URL}/api/settings/equipment/scale.comPort`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_TOKEN}`
        },
        body: JSON.stringify({ value: 'COM6' })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ PATCH /api/settings/equipment/scale.comPort успішний');
        console.log('📋 Результат:', JSON.stringify(result, null, 2));
      } else {
        console.log(`⚠️  PATCH /api/settings/equipment/scale.comPort повернув статус: ${response.status}`);
        const errorText = await response.text();
        console.log('📝 Помилка:', errorText);
      }
    } catch (error) {
      console.log('❌ PATCH /api/settings/equipment/scale.comPort не вдався:', error.message);
    }
    console.log('');

    // 4. Тестування GET /api/settings/equipment/history
    console.log('4️⃣ Тестування GET /api/settings/equipment/history...');
    try {
      const response = await fetch(`${BASE_URL}/api/settings/equipment/history?limit=5`, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`
        }
      });
      
      if (response.ok) {
        const result = await response.json() as any;
        console.log('✅ GET /api/settings/equipment/history успішний');
        console.log('📋 Кількість записів:', result.data?.length || 0);
      } else {
        console.log(`⚠️  GET /api/settings/equipment/history повернув статус: ${response.status}`);
        const errorText = await response.text();
        console.log('📝 Помилка:', errorText);
      }
    } catch (error) {
      console.log('❌ GET /api/settings/equipment/history не вдався:', error.message);
    }
    console.log('');

    // 5. Повторне тестування GET /api/settings/equipment
    console.log('5️⃣ Повторне тестування GET /api/settings/equipment...');
    try {
      const response = await fetch(`${BASE_URL}/api/settings/equipment`, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Повторний GET /api/settings/equipment успішний');
        console.log('📋 Оновлені дані:', JSON.stringify(result, null, 2));
      } else {
        console.log(`⚠️  Повторний GET /api/settings/equipment повернув статус: ${response.status}`);
        const errorText = await response.text();
        console.log('📝 Помилка:', errorText);
      }
    } catch (error) {
      console.log('❌ Повторний GET /api/settings/equipment не вдався:', error.message);
    }

  } catch (error) {
    console.error('❌ Загальна помилка тестування:', error);
  }
}

// Запуск тестування
testAPIEndpoints()
  .then(() => {
    console.log('\n🏁 Тестування API завершено');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Критична помилка:', error);
    process.exit(1);
  });
