# 🖨️ QZ Tray - Інструкція для Linux сервера

## Твоя ситуація
- ✅ QZ Tray встановлено на локальних машинах і працює
- ✅ Друк працює, але просить підтвердження кожного разу
- 🎯 **Рішення:** згенерувати сертифікати на Linux сервері

---

## 📋 Що зробити (6 кроків)

### 1️⃣ На сервері: Встановити OpenSSL (якщо немає)
```bash
# Перевірити
openssl version

# Встановити (Ubuntu/Debian)
sudo apt-get update && sudo apt-get install openssl

# Або (CentOS/RHEL)
sudo yum install openssl
```

### 2️⃣ На сервері: Згенерувати сертифікат
```bash
cd /home/backoffice.nk-food.shop/app/

# Дати права на виконання (один раз)
chmod +x scripts/generate-qz-certificate.sh

# Згенерувати
npm run qz:cert
```

**При запитаннях можна Enter скрізь**, або заповнити:
- Country: `UA`
- State: `Kyiv Oblast`
- City: `Kyiv`
- Organization: `NK Food Shop`
- Common Name: твій домен або `localhost`
- Email: твій email

**Результат:** створяться файли в `certificates/`:
- `private-key.pem` (права 600)
- `digital-certificate.crt` (права 644)
- `digital-certificate.pem` (права 644)

### 3️⃣ На сервері: Включити серверний підпис
```bash
# Відредагувати .env
nano .env

# Додати рядок:
VITE_QZ_USE_SERVER_SIGNING=true

# Зберегти: Ctrl+O → Enter → Ctrl+X
```

### 4️⃣ На сервері: Перебудувати
```bash
npm run build
```

### 5️⃣ На сервері: Перезапустити
```bash
# Якщо PM2:
pm2 restart all

# Або звичайний:
npm run server:stop && npm start &
```

### 6️⃣ На клієнтських машинах: Перезапустити QZ Tray
1. Клік правою по іконці QZ Tray в треї
2. Exit
3. Запустити QZ Tray знову

**Готово!** Більше не просить підтвердження.

---

## ✅ Перевірка

### Перевірити файли на сервері:
```bash
ls -la certificates/

# Має показати 3 файли
# -rw------- 1 user user 1704 ... private-key.pem
# -rw-r--r-- 1 user user 1180 ... digital-certificate.crt
# -rw-r--r-- 1 user user 1180 ... digital-certificate.pem
```

### Перевірити API статус:
```bash
curl https://backoffice.nk-food.shop/api/qz-tray/status

# Має повернути:
# {"configured":true,"certificate":true,"privateKey":true,"message":"QZ Tray налаштовано"}
```

### В браузері (F12 консоль):
```
QZ Tray initialized with security settings
```

---

## 🔒 Безпека

✅ **Файли в `.gitignore`** - не потраплять в git
✅ **Права доступу** - приватний ключ має `600` (тільки власник)
✅ **Серверний підпис** - приватний ключ залишається на сервері
✅ **Закритий застосунок** - для внутрішнього використання OK

---

## 💡 Важливо розуміти

- **Сертифікати** - генеруються **ОДИН РАЗ** на **СЕРВЕРІ**
- **Клієнти** (локальні машини) - **НЕ ПОТРЕБУЮТЬ** своїх сертифікатів
- **QZ Tray** - просто працює, підпис йде через сервер
- **Безпека** - приватний ключ залишається на сервері, не передається клієнтам

---

## 🔧 Команди

| Команда | Призначення |
|---------|-------------|
| `npm run qz:cert` | Згенерувати сертифікат |
| `npm run qz:test` | Тест підключення |

---

## 🎯 Підсумок

1. Генеруєш сертифікати на Linux сервері - 1 раз
2. Включаєш `VITE_QZ_USE_SERVER_SIGNING=true` в `.env`
3. Білдиш і рестартиш сервер
4. На клієнтах перезапускаєш QZ Tray
5. Працює без підтверджень ✅

Все! Сертифікати в `.gitignore`, безпечно для внутрішнього використання.

