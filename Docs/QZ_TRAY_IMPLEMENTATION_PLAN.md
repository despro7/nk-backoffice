# ✅ Покроковий план налаштування QZ Tray

## 📋 Що було зроблено:

### 1. ✅ Створено інфраструктуру
- `client/lib/qzConfig.ts` - конфігурація QZ Tray з підтримкою сертифікатів
- `server/routes/qz-tray.ts` - серверні ендпоінти для підпису та сертифікатів
- Оновлено `client/services/printerService.ts` для використання нової конфігурації
- Додано роути в `server/index.ts`

### 2. ✅ Створено скрипти
- `scripts/generate-qz-certificate.ps1` - генерація сертифікатів
- `scripts/test-qz-connection.ps1` - тестування підключення
- Додано npm команди: `npm run qz:test` та `npm run qz:cert`

### 3. ✅ Документація
- `Docs/QZ_TRAY_SETUP.md` - повна інструкція
- `Docs/QZ_TRAY_QUICKSTART.md` - швидкий старт
- Оновлено `.gitignore` для безпеки сертифікатів

---

## 🚀 Що потрібно зробити зараз:

### Варіант А: Швидкий старт (без сертифікатів - для розробки)

#### Крок 1: Встановити QZ Tray
1. Завантажити з https://qz.io/download/
2. Встановити на Windows
3. Запустити (має з'явитися іконка в системному треї)

#### Крок 2: Перевірити підключення
```powershell
npm run qz:test
```

Має вийти: `✅ QZ Tray працює!`

#### Крок 3: Готово!
Ваш додаток вже готовий працювати з QZ Tray в режимі розробки.

---

### Варіант Б: Продакшн (з сертифікатами)

#### Крок 1: Встановити OpenSSL
```powershell
# Через Chocolatey
choco install openssl

# Або через Scoop
scoop install openssl

# Або завантажити з https://slproweb.com/products/Win32OpenSSL.html
```

#### Крок 2: Згенерувати сертифікат
```powershell
npm run qz:cert
```

Слідувати інструкціям на екрані. Скрипт створить:
- `certificates/private-key.pem` - приватний ключ
- `certificates/digital-certificate.crt` - сертифікат (CRT)
- `certificates/digital-certificate.pem` - сертифікат (PEM)

#### Крок 3: Налаштувати змінні середовища
Створити `.env.local`:
```env
VITE_QZ_USE_SERVER_SIGNING=true
```

#### Крок 4: Перебудувати та запустити
```powershell
npm run rebuild
npm start
```

---

## 🧪 Тестування

### Перевірка підключення
```powershell
npm run qz:test
```

### Тест друку в коді
```typescript
import printerService from './services/printerService';

// 1. Знайти принтери
const printers = await printerService.findPrinters();
console.log('Доступні принтери:', printers);

// 2. Друк ZPL мітки
const testZpl = `
^XA
^FO50,50^ADN,36,20^FDТЕСТ ДРУКУ^FS
^FO50,100^ADN,36,20^FDЦе працює!^FS
^XZ
`;

await printerService.printZpl(printers[0].name, testZpl);
```

---

## 📚 API Endpoints (створено)

### `POST /api/qz-tray/sign`
Підписує повідомлення для QZ Tray (використовується автоматично).

**Request:**
```json
{
  "message": "string to sign"
}
```

**Response:**
```json
{
  "signature": "base64 signature",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### `GET /api/qz-tray/certificate`
Повертає публічний сертифікат.

**Response:**
```json
{
  "certificate": "-----BEGIN CERTIFICATE-----...",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### `GET /api/qz-tray/status`
Перевіряє чи налаштовано сертифікати.

**Response:**
```json
{
  "configured": true,
  "certificate": true,
  "privateKey": true,
  "message": "QZ Tray налаштовано"
}
```

---

## 🔧 Troubleshooting

### Проблема: "QZ Tray не підключається"
**Рішення:**
1. Перевірити чи запущено QZ Tray (в системному треї)
2. Запустити: `npm run qz:test`
3. Перезапустити QZ Tray
4. Перевірити фаєрвол

### Проблема: "Certificate error"
**Рішення:**
1. Перезгенерувати сертифікат: `npm run qz:cert`
2. Перевірити що файли в `certificates/` створені
3. Перезапустити додаток

### Проблема: "Принтер не друкує"
**Рішення:**
1. Перевірити що принтер підключений до системи
2. Перевірити що принтер видно в `await printerService.findPrinters()`
3. Перевірити формат ZPL коду
4. Подивитися логи в консолі браузера

---

## 🎯 Наступні кроки

1. **Встановити QZ Tray** на всіх робочих станціях
2. **Для розробки**: просто запустити QZ Tray - все вже працює
3. **Для продакшену**: згенерувати сертифікати на сервері
4. **Налаштувати автозапуск** QZ Tray (додати в автозапуск Windows)

---

## 📖 Додаткові ресурси

- Офіційна документація: https://qz.io/wiki/
- Приклади: https://qz.io/wiki/examples/
- GitHub: https://github.com/qzind/tray
- Повна документація: `Docs/QZ_TRAY_SETUP.md`
- Швидкий старт: `Docs/QZ_TRAY_QUICKSTART.md`

---

## 📞 Підтримка

Якщо виникли проблеми:
1. Перевірити `Docs/QZ_TRAY_SETUP.md` (розділ Troubleshooting)
2. Запустити діагностику: `npm run qz:test`
3. Подивитися логи в консолі браузера (F12)
4. Перевірити QZ Tray logs (через іконку в треї → View Logs)

---

**Створено:** ${new Date().toLocaleDateString('uk-UA')}
**Версія QZ Tray:** 2.2.5
**Статус:** ✅ Готово до використання

