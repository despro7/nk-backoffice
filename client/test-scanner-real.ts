import BarcodeScannerService from './services/BarcodeScannerService';

/**
 * Реальный тест для тестирования сканера MC-200PT через BarcodeScannerService
 * ВАЖНО: Для этого теста нужен реальный сканер MC-200PT, подключенный по USB
 */

class ScannerRealTest {
  private scannerService: BarcodeScannerService;
  private testResults: { [key: string]: boolean } = {};
  private scannedCodes: { code: string; type: string; timestamp: Date }[] = [];

  constructor() {
    this.scannerService = new BarcodeScannerService();
  }

  // Основной тест подключения к сканеру
  async testScannerConnection(): Promise<boolean> {
    console.log('🧪 === ТЕСТ РЕАЛЬНОГО ПОДКЛЮЧЕНИЯ К СКАНЕРУ MC-200PT ===\n');

    try {
      // 1. Проверка подключения сканера
      console.log('1️⃣ Подключение к сканеру...');
      const connected = await this.scannerService.connect();
      
      if (!connected) {
        console.error('❌ Не удалось подключиться к сканеру');
        this.testResults['connection'] = false;
        return false;
      }
      console.log('✅ Успешно подключено к сканеру (режим эмуляции клавиатуры)');
      this.testResults['connection'] = true;

      // 2. Настройка обработчиков событий
      console.log('\n2️⃣ Настройка обработчиков событий...');
      this.setupEventHandlers();
      console.log('✅ Обработчики событий настроены');
      this.testResults['eventHandlers'] = true;

      // 3. Тест сканирования различных типов кодов
      console.log('\n3️⃣ Тестирование сканирования кодов...');
      await this.testBarcodeScanning();

      // 4. Тест качества сканирования
      console.log('\n4️⃣ Тестирование качества сканирования...');
      await this.testScanningQuality();

      // 5. Тест производительности сканера
      console.log('\n5️⃣ Тестирование производительности...');
      await this.testScannerPerformance();

      // 6. Отключение от сканера
      console.log('\n6️⃣ Отключение от сканера...');
      await this.scannerService.disconnect();
      console.log('✅ Отключено от сканера');
      this.testResults['disconnection'] = true;

      return true;

    } catch (error) {
      console.error('❌ Ошибка в тесте:', error);
      return false;
    }
  }

  // Настройка обработчиков событий
  private setupEventHandlers(): void {
    this.scannerService.addEventListener((event) => {
      switch (event.type) {
        case 'connected':
          console.log('🔗 Сканер подключен');
          break;
        case 'disconnected':
          console.log('🔌 Сканер отключен');
          break;
        case 'data':
          if (event.data) {
            this.handleScannedCode(event.data);
          }
          break;
        case 'error':
          console.error('❌ Ошибка сканера:', event.error);
          break;
      }
    });
  }

  // Обработка отсканированного кода
  private handleScannedCode(barcodeData: any): void {
    this.scannedCodes.push({
      code: barcodeData.code,
      type: barcodeData.type,
      timestamp: barcodeData.timestamp
    });

    console.log(`📷 Код отсканирован: ${barcodeData.code} (${barcodeData.type})`);
  }

  // Тест сканирования различных типов кодов
  private async testBarcodeScanning(): Promise<void> {
    return new Promise((resolve) => {
      const expectedTypes = ['EAN-13', 'EAN-8', 'Code-128', 'Code-39', 'QR-Code'];
      const foundTypes = new Set<string>();
      const initialCount = this.scannedCodes.length;

      console.log('   Отсканируйте различные типы штрих-кодов:');
      console.log('   - EAN-13 (13 цифр)');
      console.log('   - EAN-8 (8 цифр)');
      console.log('   - Code-128 (буквы и цифры)');
      console.log('   - Code-39 (с дефисами)');
      console.log('   - QR-код');
      console.log('   У вас есть 30 секунд...\n');

      const timeout = setTimeout(() => {
        const scannedCount = this.scannedCodes.length - initialCount;
        
        // Анализируем отсканированные типы
        for (let i = initialCount; i < this.scannedCodes.length; i++) {
          foundTypes.add(this.scannedCodes[i].type);
        }

        console.log(`✅ Отсканировано ${scannedCount} кодов`);
        console.log(`✅ Найдено типов: ${Array.from(foundTypes).join(', ')}`);
        
        this.testResults['barcodeScanning'] = scannedCount > 0;
        this.testResults['diverseTypes'] = foundTypes.size >= 2;
        
        resolve();
      }, 30000);

      // Отслеживаем прогресс
      const progressInterval = setInterval(() => {
        const currentCount = this.scannedCodes.length - initialCount;
        if (currentCount > 0) {
          console.log(`   Отсканировано: ${currentCount} кодов...`);
        }
      }, 5000);

      setTimeout(() => clearInterval(progressInterval), 30000);
    });
  }

  // Тест качества сканирования
  private async testScanningQuality(): Promise<void> {
    return new Promise((resolve) => {
      const testCode = '1234567890123'; // Тестовый EAN-13 код
      const attempts: { success: boolean; time: number }[] = [];
      const initialCount = this.scannedCodes.length;

      console.log(`   Отсканируйте один и тот же код 5 раз: ${testCode}`);
      console.log('   Это поможет оценить точность и скорость сканера...\n');

      const timeout = setTimeout(() => {
        const relevantScans = this.scannedCodes.slice(initialCount)
          .filter(scan => scan.code === testCode);

        const successRate = relevantScans.length >= 3 ? 1 : relevantScans.length / 3;
        
        console.log(`✅ Успешных сканирований кода: ${relevantScans.length}/5`);
        console.log(`✅ Успешность: ${(successRate * 100).toFixed(1)}%`);
        
        if (relevantScans.length > 1) {
          // Анализируем скорость
          const times = relevantScans.map((scan, index) => {
            if (index === 0) return 0;
            return scan.timestamp.getTime() - relevantScans[index - 1].timestamp.getTime();
          }).filter(time => time > 0);

          if (times.length > 0) {
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            console.log(`✅ Среднее время между сканированиями: ${avgTime.toFixed(0)}мс`);
          }
        }
        
        this.testResults['scanningQuality'] = successRate >= 0.6; // 60% успешность
        resolve();
      }, 25000);
    });
  }

  // Тест производительности сканера
  private async testScannerPerformance(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const initialCount = this.scannedCodes.length;

      console.log('   Тест производительности: сканируйте как можно больше кодов за 15 секунд...\n');

      const timeout = setTimeout(() => {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        const scannedCount = this.scannedCodes.length - initialCount;
        const rate = scannedCount / duration;

        console.log(`✅ Тест завершен:`);
        console.log(`   Время: ${duration.toFixed(1)} секунд`);
        console.log(`   Отсканировано: ${scannedCount} кодов`);
        console.log(`   Скорость: ${rate.toFixed(1)} кодов/сек`);
        
        // Анализируем уникальность кодов
        const uniqueCodes = new Set(
          this.scannedCodes.slice(initialCount).map(scan => scan.code)
        );
        console.log(`   Уникальных кодов: ${uniqueCodes.size}`);
        
        this.testResults['performance'] = rate > 0.5; // Больше 0.5 кодов в секунду
        this.testResults['uniqueness'] = uniqueCodes.size >= Math.min(3, scannedCount);
        
        resolve();
      }, 15000);

      // Показываем прогресс каждые 3 секунды
      const progressInterval = setInterval(() => {
        const currentCount = this.scannedCodes.length - initialCount;
        console.log(`   Отсканировано: ${currentCount} кодов...`);
      }, 3000);

      setTimeout(() => clearInterval(progressInterval), 15000);
    });
  }

  // Тест различных настроек сканера
  async testDifferentSettings(): Promise<void> {
    console.log('\n🧪 === ТЕСТ РАЗЛИЧНЫХ НАСТРОЕК СКАНЕРА ===\n');

    const settings = [
      { autoConnect: true, timeout: 5000, continuousMode: true },
      { autoConnect: true, timeout: 2000, continuousMode: false },
      { autoConnect: false, timeout: 10000, continuousMode: true }
    ];

    for (let i = 0; i < settings.length; i++) {
      const config = settings[i];
      console.log(`${i + 1}️⃣ Тестирование настроек: ${JSON.stringify(config)}`);
      
      try {
        // Обновляем конфигурацию
        this.scannerService.updateConfig(config);
        
        // Переподключаемся
        await this.scannerService.disconnect();
        const connected = await this.scannerService.connect();
        
        if (connected) {
          console.log('✅ Подключение успешно с этими настройками');
          
          // Ждем немного активности
          await this.waitForScanActivity(5000);
          
        } else {
          console.log('❌ Подключение не удалось с этими настройками');
        }
        
      } catch (error) {
        console.log(`❌ Ошибка с настройками: ${error.message}`);
      }
      
      console.log('');
    }
  }

  // Тест стабильности работы сканера
  async testScannerStability(): Promise<void> {
    console.log('\n🧪 === ТЕСТ СТАБИЛЬНОСТИ СКАНЕРА ===\n');

    try {
      console.log('Подключение к сканеру...');
      const connected = await this.scannerService.connect();
      
      if (!connected) {
        console.error('❌ Не удалось подключиться для теста стабильности');
        return;
      }

      let scanCount = 0;
      let errorCount = 0;
      const startTime = Date.now();
      const initialCount = this.scannedCodes.length;
      
      // Тестируем в течение 60 секунд
      const testDuration = 60000;
      
      console.log(`Тестирование стабильности в течение ${testDuration / 1000} секунд...`);
      console.log('Сканируйте коды в обычном режиме...\n');
      
      const progressInterval = setInterval(() => {
        const currentScanCount = this.scannedCodes.length - initialCount;
        if (currentScanCount !== scanCount) {
          scanCount = currentScanCount;
          console.log(`   Отсканировано: ${scanCount} кодов...`);
        }
      }, 10000);

      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(progressInterval);
      
      const endTime = Date.now();
      const actualDuration = endTime - startTime;
      const finalScanCount = this.scannedCodes.length - initialCount;
      const scanRate = (finalScanCount / (actualDuration / 1000)).toFixed(2);
      
      console.log(`✅ Тест завершен:`);
      console.log(`   Общее время: ${actualDuration / 1000} секунд`);
      console.log(`   Отсканировано: ${finalScanCount} кодов`);
      console.log(`   Ошибок: ${errorCount}`);
      console.log(`   Средняя скорость: ${scanRate} кодов/сек`);
      
      await this.scannerService.disconnect();
      
    } catch (error) {
      console.error('❌ Ошибка в тесте стабильности:', error);
    }
  }

  // Вспомогательная функция ожидания активности сканера
  private async waitForScanActivity(timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const initialCount = this.scannedCodes.length;
      let activityDetected = false;
      
      const timer = setTimeout(() => {
        resolve(activityDetected);
      }, timeout);
      
      const checkActivity = setInterval(() => {
        if (this.scannedCodes.length > initialCount && !activityDetected) {
          activityDetected = true;
          clearTimeout(timer);
          clearInterval(checkActivity);
          resolve(true);
        }
      }, 100);
      
      setTimeout(() => clearInterval(checkActivity), timeout);
    });
  }

  // Анализ типов отсканированных кодов
  analyzeScannedCodes(): void {
    console.log('\n📊 === АНАЛИЗ ОТСКАНИРОВАННЫХ КОДОВ ===\n');
    
    if (this.scannedCodes.length === 0) {
      console.log('❌ Коды не были отсканированы');
      return;
    }

    // Группируем по типам
    const typeGroups = this.scannedCodes.reduce((groups, scan) => {
      groups[scan.type] = (groups[scan.type] || 0) + 1;
      return groups;
    }, {} as { [key: string]: number });

    console.log('Типы отсканированных кодов:');
    Object.entries(typeGroups).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} кодов`);
    });

    // Показываем последние коды
    console.log('\nПоследние 5 отсканированных кодов:');
    this.scannedCodes.slice(-5).forEach((scan, index) => {
      console.log(`  ${index + 1}. ${scan.code} (${scan.type}) - ${scan.timestamp.toLocaleTimeString()}`);
    });
  }

  // Вывод результатов тестирования
  printResults(): void {
    console.log('\n📊 === РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ СКАНЕРА ===\n');
    
    const tests = [
      { key: 'connection', name: 'Подключение к сканеру' },
      { key: 'eventHandlers', name: 'Обработчики событий' },
      { key: 'barcodeScanning', name: 'Сканирование кодов' },
      { key: 'diverseTypes', name: 'Разнообразие типов кодов' },
      { key: 'scanningQuality', name: 'Качество сканирования' },
      { key: 'performance', name: 'Производительность' },
      { key: 'uniqueness', name: 'Уникальность кодов' },
      { key: 'disconnection', name: 'Отключение от сканера' }
    ];
    
    let passedTests = 0;
    
    tests.forEach(test => {
      const result = this.testResults[test.key];
      const status = result ? '✅' : '❌';
      console.log(`${status} ${test.name}: ${result ? 'PASSED' : 'FAILED'}`);
      if (result) passedTests++;
    });
    
    console.log(`\n📈 Результат: ${passedTests}/${tests.length} тестов пройдено`);
    console.log(`📷 Всего отсканировано кодов: ${this.scannedCodes.length}`);
    
    if (passedTests >= tests.length * 0.75) {
      console.log('🎉 СКАНЕР РАБОТАЕТ ОТЛИЧНО!');
    } else if (passedTests >= tests.length * 0.5) {
      console.log('⚠️ Сканер работает, но есть проблемы');
    } else {
      console.log('❌ Сканер работает плохо. Проверьте подключение и настройки.');
    }
  }
}

// Функция для запуска тестов из браузера
async function runScannerRealTests() {
  const tester = new ScannerRealTest();
  
  console.log('🚀 Запуск реальных тестов сканера MC-200PT...\n');
  console.log('⚠️ ВНИМАНИЕ: Убедитесь, что сканер MC-200PT подключен и работает!\n');
  console.log('📋 Подготовьте различные штрих-коды для тестирования.\n');
  
  try {
    // Основной тест
    await tester.testScannerConnection();
    
    // Дополнительные тесты (можно включить по желанию)
    // await tester.testDifferentSettings();
    // await tester.testScannerStability();
    
    // Анализируем результаты
    tester.analyzeScannedCodes();
    
    // Выводим результаты
    tester.printResults();
    
  } catch (error) {
    console.error('💥 Критическая ошибка в тестах:', error);
  }
}

// Экспортируем для использования в браузере
if (typeof window !== 'undefined') {
  (window as any).runScannerRealTests = runScannerRealTests;
  console.log('🔧 Тест загружен. Вызовите runScannerRealTests() для запуска тестов.');
}

export { ScannerRealTest, runScannerRealTests };
