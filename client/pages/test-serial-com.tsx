import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ScannedCode {
  code: string;
  timestamp: string;
  type: string;
}

const TestSerialCom: React.FC = () => {
  // Стани для Web Serial API
  const [apiSupport, setApiSupport] = useState<string>('Перевіряємо...');
  const [apiSupportClass, setApiSupportClass] = useState<'info' | 'success' | 'error'>('info');

  // Стани для ваг
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleResult, setScaleResult] = useState('');
  const [scaleResultClass, setScaleResultClass] = useState<'info' | 'success' | 'error'>('info');
  const [baudRate, setBaudRate] = useState(9600);
  const [dataBits, setDataBits] = useState(8);
  const [parity, setParity] = useState<'none' | 'even' | 'odd'>('none');

  // Стани для сканера
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerResult, setScannerResult] = useState('');
  const [scannerResultClass, setScannerResultClass] = useState<'info' | 'success' | 'error'>('info');
  const [scannedCodes, setScannedCodes] = useState<ScannedCode[]>([]);

  // Refs для роботи з Serial API
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const scanBufferRef = useRef('');
  const lastScanTimeRef = useRef(0);
  const SCAN_TIMEOUT = 100;

  // Перевірка підтримки Web Serial API
  const checkSerialSupport = useCallback(() => {
    if ('serial' in navigator) {
      setApiSupport('✅ Web Serial API підтримується!');
      setApiSupportClass('success');
    } else {
      setApiSupport('❌ Web Serial API НЕ підтримується!');
      setApiSupportClass('error');
    }
  }, []);

  // Підключення до ваг
  const connectToScale = async () => {
    setScaleResult('🔄 Підключення до ваг...');
    setScaleResultClass('info');

    try {
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API не підтримується');
      }

      const port = await (navigator as any).serial.requestPort();
      portRef.current = port;

      // Відкриваємо порт
      await port.open({
        baudRate,
        dataBits,
        stopBits: 1,
        parity,
        bufferSize: 1024
      });

      setScaleResult(`✅ Успішно підключено до ваг!\n\nНалаштування:\n- Швидкість: ${baudRate} бод\n- Біти даних: ${dataBits}\n- Парність: ${parity}\n\nТепер можете зчитувати дані з ваг.`);
      setScaleResultClass('success');
      setScaleConnected(true);

      // Запускаємо читання даних
      startReadingScale();

    } catch (error: any) {
      setScaleResult(`❌ Помилка підключення: ${error.message}\n\nПеревірте:\n- Чи підключені ваги\n- Чи правильний COM порт\n- Чи встановлені драйвери`);
      setScaleResultClass('error');
    }
  };

  // Відключення від ваг
  const disconnectFromScale = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }

      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }

      setScaleResult('🔌 Відключено від ваг');
      setScaleResultClass('info');
      setScaleConnected(false);

    } catch (error) {
      console.error('Помилка відключення:', error);
    }
  };

  // Запуск читання даних з ваг
  const startReadingScale = async () => {
    if (!portRef.current?.readable) return;

    try {
      const textDecoder = new TextDecoder();
      readerRef.current = portRef.current.readable.getReader();

      let buffer = '';

      while (portRef.current.readable) {
        try {
          const { value, done } = await readerRef.current.read();

          if (done) break;

          if (value) {
            const chunk = textDecoder.decode(value, { stream: true });
            buffer += chunk;

            // Обробляємо повні повідомлення
            const lines = buffer.split('\r\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                processWeightData(line.trim());
              }
            }
          }
        } catch (error) {
          console.error('Помилка читання:', error);
          break;
        }
      }
    } catch (error) {
      console.error('Помилка запуску читання:', error);
    }
  };

  // Обробка даних з ваг
  const processWeightData = (data: string) => {
    const weightMatch = data.match(/([+-]?\d+\.?\d*)/);

    if (weightMatch) {
      const weight = parseFloat(weightMatch[1]);
      const timestamp = new Date().toLocaleTimeString();

      setScaleResult(`📊 ДАНІ З ВАГ:\n\nВага: ${weight} кг\nЧас: ${timestamp}\nСирі дані: ${data}`);
      setScaleResultClass('success');
    } else {
      console.log('Отримано дані:', data);
    }
  };

  // Запит поточної ваги
  const readWeight = async () => {
    if (!portRef.current?.writable) {
      alert('Спочатку підключіться до ваг');
      return;
    }

    try {
      const writer = portRef.current.writable.getWriter();

      const command = new TextEncoder().encode('W\r\n');
      await writer.write(command);

      writer.releaseLock();

      console.log('Команда запиту ваги надіслана');
    } catch (error) {
      console.error('Помилка надсилання команди:', error);
    }
  };

  // Початок тесту сканера
  const startScannerTest = () => {
    setScannerResult('🔄 Тест сканера запущено...\n\nСканер працює в режимі емуляції клавіатури.\nПросто поставте курсор сюди і скануйте штрих-код.');
    setScannerResultClass('info');
    setScannerActive(true);
    scanBufferRef.current = '';
  };

  // Зупинка тесту сканера
  const stopScannerTest = () => {
    setScannerActive(false);
    setScannerResult('⏹️ Тест сканера зупинено');
    setScannerResultClass('info');
  };

  // Обробка вводу зі сканера
  const handleScannerInput = useCallback((event: KeyboardEvent) => {
    if (!scannerActive || !event.key) return;

    const currentTime = Date.now();

    if (currentTime - lastScanTimeRef.current < SCAN_TIMEOUT) {
      if (event.key === 'Enter') {
        processScannedCode();
      } else if (event.key.length === 1) {
        scanBufferRef.current += event.key;
      }
    } else {
      scanBufferRef.current = '';
      if (event.key.length === 1) {
        scanBufferRef.current += event.key;
      }
    }

    lastScanTimeRef.current = currentTime;
  }, [scannerActive]);

  // Обробка відсканованого коду
  const processScannedCode = () => {
    if (!scanBufferRef.current.trim()) return;

    const code = scanBufferRef.current.trim();
    const timestamp = new Date().toLocaleTimeString();
    const type = detectBarcodeType(code);

    const newCode: ScannedCode = { code, timestamp, type };
    setScannedCodes(prev => [newCode, ...prev]);

    setScannerResult(`✅ КОД ВІДСКАНОВАНИЙ!\n\nКод: ${code}\nТип: ${type}\nЧас: ${timestamp}\n\nЗагальних сканувань: ${scannedCodes.length + 1}`);
    setScannerResultClass('success');

    scanBufferRef.current = '';
  };


  // Визначення типу штрих-коду
  const detectBarcodeType = (code: string): string => {
    if (/^\d{13}$/.test(code)) return 'EAN-13';
    if (/^\d{8}$/.test(code)) return 'EAN-8';
    if (/^\d{12}$/.test(code)) return 'UPC-A';
    if (/^[A-Z0-9]+$/.test(code)) return 'Code-128';
    if (/^[A-Z0-9\-\.\/\+\s]+$/.test(code)) return 'Code-39';
    return 'Unknown';
  };

  // Ефекти
  useEffect(() => {
    checkSerialSupport();
  }, [checkSerialSupport]);

  useEffect(() => {
    if (scannerActive) {
      document.addEventListener('keydown', handleScannerInput);
      return () => document.removeEventListener('keydown', handleScannerInput);
    }
  }, [scannerActive, handleScannerInput]);


  return (
    <div className="max-w-4xl">

      <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-6">
        <strong>⚠️ Увага:</strong> Цей тест потребує реального обладнання (ваги ВТА-60, сканер MC-200PT) та підтримки Web Serial API.
        Переконайтеся, що обладнання підключене та браузер підтримує Web Serial API (Chrome/Edge 89+).
        <br />
        <strong>🔧 Блок "Тестування обладнання":</strong> дозволяє підключатися до будь-якого Serial Port та моніторити дані в реальному часі.
      </div>

      {/* Перевірка Web Serial API */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4">🌐 Перевірка підтримки Web Serial API</h2>
        <div className={`mt-4 p-4 rounded font-mono whitespace-pre-wrap max-h-60 overflow-y-auto ${
          apiSupportClass === 'success' ? 'bg-green-100 border border-green-300 text-green-800' :
          apiSupportClass === 'error' ? 'bg-red-100 border border-red-300 text-red-800' :
          'bg-blue-100 border border-blue-300 text-blue-800'
        }`}>
          {apiSupport}
        </div>
        <button
          onClick={checkSerialSupport}
          className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
        >
          Перевірити підтримку
        </button>
      </div>

      {/* Тестування ваг */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4">⚖️ Тестування ваг ВТА-60</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block font-medium mb-2">Швидкість передачі (бод):</label>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value={9600}>9600</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
            </select>
          </div>

          <div>
            <label className="block font-medium mb-2">Біти даних:</label>
            <select
              value={dataBits}
              onChange={(e) => setDataBits(Number(e.target.value))}
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value={7}>7</option>
              <option value={8}>8</option>
            </select>
          </div>

          <div>
            <label className="block font-medium mb-2">Парність:</label>
            <select
              value={parity}
              onChange={(e) => setParity(e.target.value as 'none' | 'even' | 'odd')}
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value="none">Немає</option>
              <option value="even">Парна</option>
              <option value="odd">Непарна</option>
            </select>
          </div>
        </div>

        <div className="border border-gray-200 rounded p-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={connectToScale}
              disabled={scaleConnected}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded transition-colors"
            >
              Підключитися до ваг
            </button>
            <button
              onClick={disconnectFromScale}
              disabled={!scaleConnected}
              className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-4 py-2 rounded transition-colors"
            >
              Відключитися
            </button>
            <button
              onClick={readWeight}
              disabled={!scaleConnected}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-4 py-2 rounded transition-colors"
            >
              Зчитати вагу
            </button>
          </div>

          {scaleResult && (
            <div className={`p-4 rounded font-mono whitespace-pre-wrap max-h-60 overflow-y-auto ${
              scaleResultClass === 'success' ? 'bg-green-100 border border-green-300 text-green-800' :
              scaleResultClass === 'error' ? 'bg-red-100 border border-red-300 text-red-800' :
              'bg-blue-100 border border-blue-300 text-blue-800'
            }`}>
              {scaleResult}
            </div>
          )}
        </div>
      </div>


      {/* Тестування сканера */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-semibold mb-4">📷 Тестування сканера MC-200PT</h2>

        <div className="border border-gray-200 rounded p-4">
          <div className="flex gap-2 mb-4">
            <button
              onClick={startScannerTest}
              disabled={scannerActive}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded transition-colors"
            >
              Почати тест сканера
            </button>
            <button
              onClick={stopScannerTest}
              disabled={!scannerActive}
              className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-4 py-2 rounded transition-colors"
            >
              Зупинити тест
            </button>
          </div>

          {scannerResult && (
            <div className={`mb-4 p-4 rounded font-mono whitespace-pre-wrap max-h-40 overflow-y-auto ${
              scannerResultClass === 'success' ? 'bg-green-100 border border-green-300 text-green-800' :
              scannerResultClass === 'error' ? 'bg-red-100 border border-red-300 text-red-800' :
              'bg-blue-100 border border-blue-300 text-blue-800'
            }`}>
              {scannerResult}
            </div>
          )}

          <div className="mt-4">
            <h4 className="font-semibold mb-2">Відскановані коди:</h4>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {scannedCodes.map((item, index) => (
                <li key={index} className="bg-gray-50 p-2 rounded">
                  <strong>{item.code}</strong> - {item.timestamp} ({item.type})
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestSerialCom;
