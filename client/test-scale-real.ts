import ScaleService from './services/ScaleService';

/**
 * Реальный тест для тестирования ваг ВТА-60 через ScaleService
 * ВАЖНО: Для этого теста нужны реальные ваги ВТА-60, подключенные по COM порту
 */

class ScaleRealTest {
  private scaleService: ScaleService;
  private testResults: { [key: string]: boolean } = {};

  constructor() {
    this.scaleService = new ScaleService();
  }

  // Основной тест подключения к весам
  async testScaleConnection(): Promise<boolean> {
    console.log('🧪 === ТЕСТ РЕАЛЬНОГО ПОДКЛЮЧЕНИЯ К ВЕСАМ ВТА-60 ===\n');

    try {
      // 1. Проверка поддержки Web Serial API
      console.log('1️⃣ Проверка поддержки Web Serial API...');
      if (!('serial' in navigator)) {
        console.error('❌ Web Serial API не поддерживается в этом браузере');
        this.testResults['webSerialSupport'] = false;
        return false;
      }
      console.log('✅ Web Serial API поддерживается');
      this.testResults['webSerialSupport'] = true;

      // 2. Попытка подключения к весам
      console.log('\n2️⃣ Подключение к весам...');
      const connected = await this.scaleService.connect();
      
      if (!connected) {
        console.error('❌ Не удалось подключиться к весам');
        this.testResults['connection'] = false;
        return false;
      }
      console.log('✅ Успешно подключено к весам');
      this.testResults['connection'] = true;

      // 3. Тест чтения данных
      console.log('\n3️⃣ Тестирование чтения данных...');
      await this.testWeightReading();

      // 4. Тест получения текущей ваги
      console.log('\n4️⃣ Тестирование получения текущей ваги...');
      await this.testCurrentWeight();

      // 5. Тест с callback'ом
      console.log('\n5️⃣ Тестирование callback для изменения ваги...');
      await this.testWeightCallback();

      // 6. Отключение от ваг
      console.log('\n6️⃣ Отключение от ваг...');
      await this.scaleService.disconnect();
      console.log('✅ Отключено от ваг');
      this.testResults['disconnection'] = true;

      return true;

    } catch (error) {
      console.error('❌ Ошибка в тесте:', error);
      return false;
    }
  }

  // Тест чтения данных с ваг
  private async testWeightReading(): Promise<void> {
    return new Promise((resolve) => {
      let dataReceived = false;
      const timeout = setTimeout(() => {
        if (!dataReceived) {
          console.log('⚠️ Данные с ваг не получены в течение 10 секунд');
          this.testResults['dataReading'] = false;
        }
        resolve();
      }, 10000);

      // Устанавливаем callback для получения данных
      this.scaleService.onWeightData((weightData) => {
        dataReceived = true;
        clearTimeout(timeout);
        
        console.log('✅ Получены данные с ваг:');
        console.log(`   Вага: ${weightData.weight} ${weightData.unit}`);
        console.log(`   Стабільно: ${weightData.isStable ? 'Да' : 'Нет'}`);
        console.log(`   Время: ${weightData.timestamp.toLocaleTimeString()}`);
        
        this.testResults['dataReading'] = true;
        resolve();
      });

      console.log('   Ожидание данных с ваг... (положите что-то на ваги)');
    });
  }

  // Тест получения текущей ваги
  private async testCurrentWeight(): Promise<void> {
    try {
      console.log('   Запрос текущей ваги...');
      const weightData = await this.scaleService.getCurrentWeight();
      
      if (weightData) {
        console.log('✅ Текущая вага получена:');
        console.log(`   Вага: ${weightData.weight} ${weightData.unit}`);
        console.log(`   Стабільно: ${weightData.isStable ? 'Да' : 'Нет'}`);
        this.testResults['currentWeight'] = true;
      } else {
        console.log('⚠️ Не удалось получить текущую вагу');
        this.testResults['currentWeight'] = false;
      }
    } catch (error) {
      console.error('❌ Ошибка получения текущей ваги:', error);
      this.testResults['currentWeight'] = false;
    }
  }

  // Тест callback'а для изменения ваги
  private async testWeightCallback(): Promise<void> {
    return new Promise((resolve) => {
      let changesDetected = 0;
      let lastWeight = 0;
      
      const timeout = setTimeout(() => {
        if (changesDetected > 0) {
          console.log(`✅ Обнаружено ${changesDetected} изменений ваги`);
          this.testResults['weightCallback'] = true;
        } else {
          console.log('⚠️ Изменения ваги не обнаружены');
          this.testResults['weightCallback'] = false;
        }
        resolve();
      }, 15000);

      // Устанавливаем callback для отслеживания изменений
      this.scaleService.onWeightData((weightData) => {
        const currentWeight = weightData.weight;
        
        if (Math.abs(currentWeight - lastWeight) > 0.01) { // Изменение больше 10г
          changesDetected++;
          console.log(`   Изменение ваги #${changesDetected}: ${lastWeight} → ${currentWeight} кг`);
          lastWeight = currentWeight;
        }
      });

      console.log('   Измените вагу на весах несколько раз...');
      console.log('   (добавьте или уберите что-то с ваг)');
    });
  }

  // Тест различных конфигураций подключения
  async testDifferentConfigurations(): Promise<void> {
    console.log('\n🧪 === ТЕСТ РАЗЛИЧНЫХ КОНФИГУРАЦИЙ ===\n');

    const configurations = [
      { comPort: 'COM1', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' as const },
      { comPort: 'COM1', baudRate: 19200, dataBits: 8, stopBits: 1, parity: 'none' as const },
      { comPort: 'COM1', baudRate: 9600, dataBits: 7, stopBits: 1, parity: 'even' as const }
    ];

    for (let i = 0; i < configurations.length; i++) {
      const config = configurations[i];
      console.log(`${i + 1}️⃣ Тестирование конфигурации: ${JSON.stringify(config)}`);
      
      try {
        // Обновляем конфигурацию
        this.scaleService.updateConfig(config);
        
        // Пытаемся подключиться
        const connected = await this.scaleService.connect();
        
        if (connected) {
          console.log('✅ Подключение успешно с этой конфигурацией');
          
          // Ждем немного данных
          await this.waitForData(3000);
          
          // Отключаемся
          await this.scaleService.disconnect();
        } else {
          console.log('❌ Подключение не удалось с этой конфигурацией');
        }
        
      } catch (error) {
        console.log(`❌ Ошибка с конфигурацией: ${error.message}`);
      }
      
      console.log('');
    }
  }

  // Тест стабильности подключения
  async testConnectionStability(): Promise<void> {
    console.log('\n🧪 === ТЕСТ СТАБИЛЬНОСТИ ПОДКЛЮЧЕНИЯ ===\n');

    try {
      console.log('Подключение к весам...');
      const connected = await this.scaleService.connect();
      
      if (!connected) {
        console.error('❌ Не удалось подключиться для теста стабильности');
        return;
      }

      let dataCount = 0;
      let errorCount = 0;
      const startTime = Date.now();
      
      // Тестируем в течение 30 секунд
      const testDuration = 30000;
      
      this.scaleService.onWeightData((weightData) => {
        dataCount++;
        if (dataCount % 10 === 0) {
          console.log(`   Получено ${dataCount} пакетов данных...`);
        }
      });

      console.log(`Тестирование стабильности в течение ${testDuration / 1000} секунд...`);
      
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      const endTime = Date.now();
      const actualDuration = endTime - startTime;
      const dataRate = (dataCount / (actualDuration / 1000)).toFixed(2);
      
      console.log(`✅ Тест завершен:`);
      console.log(`   Общее время: ${actualDuration / 1000} секунд`);
      console.log(`   Получено пакетов: ${dataCount}`);
      console.log(`   Ошибок: ${errorCount}`);
      console.log(`   Частота данных: ${dataRate} пакетов/сек`);
      
      await this.scaleService.disconnect();
      
    } catch (error) {
      console.error('❌ Ошибка в тесте стабильности:', error);
    }
  }

  // Вспомогательная функция ожидания данных
  private async waitForData(timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      let dataReceived = false;
      
      const timer = setTimeout(() => {
        resolve(dataReceived);
      }, timeout);
      
      this.scaleService.onWeightData(() => {
        if (!dataReceived) {
          dataReceived = true;
          clearTimeout(timer);
          resolve(true);
        }
      });
    });
  }

  // Вывод результатов тестирования
  printResults(): void {
    console.log('\n📊 === РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ ===\n');
    
    const tests = [
      { key: 'webSerialSupport', name: 'Поддержка Web Serial API' },
      { key: 'connection', name: 'Подключение к весам' },
      { key: 'dataReading', name: 'Чтение данных' },
      { key: 'currentWeight', name: 'Получение текущей ваги' },
      { key: 'weightCallback', name: 'Callback изменений ваги' },
      { key: 'disconnection', name: 'Отключение от ваг' }
    ];
    
    let passedTests = 0;
    
    tests.forEach(test => {
      const result = this.testResults[test.key];
      const status = result ? '✅' : '❌';
      console.log(`${status} ${test.name}: ${result ? 'PASSED' : 'FAILED'}`);
      if (result) passedTests++;
    });
    
    console.log(`\n📈 Результат: ${passedTests}/${tests.length} тестов пройдено`);
    
    if (passedTests === tests.length) {
      console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Ваги работают корректно.');
    } else {
      console.log('⚠️ Некоторые тесты не пройдены. Проверьте подключение и настройки.');
    }
  }
}

// Функция для запуска тестов из браузера
async function runScaleRealTests() {
  const tester = new ScaleRealTest();
  
  console.log('🚀 Запуск реальных тестов ваг ВТА-60...\n');
  console.log('⚠️ ВНИМАНИЕ: Убедитесь, что ваги ВТА-60 подключены и включены!\n');
  
  try {
    // Основной тест
    await tester.testScaleConnection();
    
    // Дополнительные тесты (можно включить по желанию)
    // await tester.testDifferentConfigurations();
    // await tester.testConnectionStability();
    
    // Выводим результаты
    tester.printResults();
    
  } catch (error) {
    console.error('💥 Критическая ошибка в тестах:', error);
  }
}

// Экспортируем для использования в браузере
if (typeof window !== 'undefined') {
  (window as any).runScaleRealTests = runScaleRealTests;
  console.log('🔧 Тест загружен. Вызовите runScaleRealTests() для запуска тестов.');
}

export { ScaleRealTest, runScaleRealTests };
