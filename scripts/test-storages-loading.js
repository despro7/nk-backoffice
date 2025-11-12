async function testStoragesLoading() {
  try {
    console.log('🧪 === ТЕСТ ЗАВАНТАЖЕННЯ СКЛАДІВ ЧЕРЕЗ API ===');
    
    // Використовуємо fetch для тестування API
    const apiUrl = 'http://localhost:3001/api/dilovod/directories';
    
    console.log('📡 Виконуємо перший запит складів через API...');
    const response1 = await fetch(apiUrl, {
      headers: {
        'Authorization': 'Bearer test-token'  // потрібно додати valid token
      }
    });
    
    if (!response1.ok) {
      console.log(`❌ API response error: ${response1.status} ${response1.statusText}`);
      return;
    }
    
    const data1 = await response1.json();
    console.log(`✅ Перший запит: отримано ${data1.data?.storages?.length || 0} складів`);
    
    console.log('📡 Виконуємо другий запит складів через API...');
    const response2 = await fetch(apiUrl, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    const data2 = await response2.json();
    console.log(`✅ Другий запит: отримано ${data2.data?.storages?.length || 0} складів`);
    
    console.log('📡 Виконуємо третій запит складів через API...');
    const response3 = await fetch(apiUrl, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    const data3 = await response3.json();
    console.log(`✅ Третій запит: отримано ${data3.data?.storages?.length || 0} складів`);
    
    // Перевіряємо стабільність
    const count1 = data1.data?.storages?.length || 0;
    const count2 = data2.data?.storages?.length || 0;
    const count3 = data3.data?.storages?.length || 0;
    
    if (count1 === count2 && count2 === count3) {
      console.log(`✅ Кількість складів стабільна у всіх запитах: ${count1}`);
    } else {
      console.log('⚠️ Кількість складів нестабільна:', {
        first: count1,
        second: count2,
        third: count3
      });
    }
    
    // Виводимо структуру складів для аналізу
    if (count1 > 0) {
      console.log('\n📋 Структура першого складу:');
      console.log(JSON.stringify(data1.data.storages[0], null, 2));
      
      console.log('\n📋 Всі склади з першого запиту:');
      data1.data.storages.forEach((storage, index) => {
        console.log(`${index + 1}. ID: ${storage.id} | Code: ${storage.code} | Name: ${storage.name}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Помилка тестування:', error);
  }
}

testStoragesLoading();