# Налаштування SalesDrive API

## 🔑 Конфігурація

### 1. Створіть файл `.env` в корені проекту:

```env
# SalesDrive API Configuration
SALESDRIVE_API_URL="https://yourdomain.salesdrive.me/api/order/list/"
SALESDRIVE_API_KEY="your_api_key_here"

# Database (для майбутнього використання)
DATABASE_URL="mysql://username:password@localhost:3306/nova_field"
```

### 2. Замініть на ваші реальні дані:

- `SALESDRIVE_API_URL` - повний URL вашого SalesDrive API (включає `/api/order/list/`)
- `SALESDRIVE_API_KEY` - ваш API ключ для автентифікації

## 📡 API Endpoints

Система використовує офіційний SalesDrive API з документації: https://salesdrive.ua/knowledge/api/order-list/

### Отримання замовлень
```
GET /api/order/list/?page=1&limit=50&filter[orderTime][from]=2025-08-18&filter[orderTime][to]=2025-12-31&filter[statusId]=__ALL__
```

**Параметри:**
- `page` - номер сторінки (починається з 1)
- `limit` - максимальна кількість замовлень на сторінку (максимум 50)
- `filter[orderTime][from]` - дата початку (YYYY-MM-DD)
- `filter[orderTime][to]` - дата кінця (YYYY-MM-DD)
- `filter[statusId]` - фільтр по статусу (__ALL__ для всіх статусів)

**Заголовки:**
```
Form-Api-Key: YOUR_API_KEY
Content-Type: application/json
```

**Очікувана відповідь від SalesDrive:**
```json
{
  "status": "success",
  "data": [
    {
      "id": 768,
      "externalId": "6465",
      "orderTime": "2025-08-23 13:42:57",
      "statusId": 1,
      "paymentAmount": 589,
      "kilTPorcij": 9,
      "shipping_method": 9,
      "payment_method": 14,
      "shipping_address": "1, П...",
      "comment": "",
      "updateAt": "2025-08-23 13:42:57",
      "ord_delivery_data": [
        {
          "trackingNumber": "20451231851340",
          "cityName": "Київ",
          "provider": "novaposhta"
        }
      ],
      "primaryContact": {
        "lName": "Лариса",
        "fName": "Кривошапка",
        "mName": "Григорівна",
        "phone": ["380957576643"]
      },
      "products": [
        {
          "text": "Борщ з куркою",
          "amount": 3,
          "price": 196.33,
          "sku": "BORSCH_CHICKEN"
        }
      ]
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageCount": 4,
    "perPage": 50
  },
  "totals": {
    "count": 194,
    "paymentAmount": 205852
  }
}
```

**Дані, які ми отримуємо та обробляємо:**
- **Основна інформація**: ID, номер замовлення, дата, статус, кількість порцій
- **Клієнт**: ПІБ, телефон, адреса доставки
- **Доставка**: ТТН, місто, постачальник (Нова Пошта, Укрпошта)
- **Товари**: Назва, кількість, ціна, SKU
- **Оплата**: Сума, спосіб оплати, комісія
- **UTM мета**: Джерело трафіку, кампанія, контент

## 🚀 Запуск

### 1. Запустіть сервер:
```bash
npm run dev:server
```

### 2. Запустіть клієнт:
```bash
npm run dev
```

## 📊 Тестування API

### Перевірте з'єднання:
```bash
curl -H "Form-Api-Key: YOUR_API_KEY" \
     "https://yourdomain.salesdrive.me/api/order/list/?page=1&limit=1"
```

### Отримайте замовлення:
```bash
curl -H "Form-Api-Key: YOUR_API_KEY" \
     "https://yourdomain.salesdrive.me/api/order/list/?page=1&limit=50&filter[orderTime][from]=2025-08-18"
```

## 🔍 Відладка

### Логи сервера показують:
- Параметри запиту до SalesDrive
- Кількість отриманих замовлень
- Помилки з'єднання
- Результати кешування

### Raw дані доступні за адресою:
```
GET /api/orders/raw/all
```

## ⚠️ Важливо

1. **API ключ** повинен мати права на читання замовлень
2. **Дата 18.08.2025** встановлена як початкова для отримання замовлень
3. **Ліміт** встановлений на 50 замовлень за один запит для избежания rate limiting
4. **Кешування** діє 5 хвилин для зменшення навантаження на API

## 🆘 Проблеми

### Якщо API не відповідає:
1. Перевірте правильність URL та API ключа
2. Переконайтеся, що API підтримує необхідні endpoints
3. Перевірте права доступу API ключа
4. Дивіться логи сервера для деталей помилок

### Rate Limiting (429 помилка):
- Система автоматично повторює запити з затримкою
- Максимум 3 спроби з інтервалом 2 секунди
- Дані кешуються для зменшення навантаження

## 2. Переносим статистику на Dashboard

Сначала посмотрим на Dashboard:
