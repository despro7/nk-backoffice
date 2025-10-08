# Додавання самопідписаного сертифіката в QZ Tray

## Проблема
QZ Tray показує "Invalid Signature" та "Untrusted website" для самопідписаного сертифіката.

## Швидке рішення

### 1. Через QZ Tray інтерфейс (РЕКОМЕНДОВАНО):

1. Клікнути **правою кнопкою на іконку QZ Tray** в системному треї
2. Обрати **Advanced → Site Manager**
3. Натиснути **Add**
4. Додати твій домен/адресу:
   - `https://backoffice.nk-food.shop`
   - або `http://localhost:8080` (для локального тестування)
5. В полі **Certificate Handling** обрати **"Always Allow"**
6. Натиснути **Save**
7. **Перезапустити QZ Tray**

### 2. Експорт сертифіката з серверу (альтернатива):

```bash
# На сервері
cd /path/to/nova-field

# Експортувати сертифікат в форматі для QZ Tray
openssl x509 -in certificates/digital-certificate.pem -out certificates/qz-certificate.txt -outform PEM

# Показати вміст (скопіювати)
cat certificates/qz-certificate.txt
```

Потім в QZ Tray:
1. **Advanced → Certificate Manager**
2. **Import Certificate**
3. Вставити вміст сертифіката
4. **Trust**

### 3. Додати fingerprint в QZ Tray (найшвидше для тесту):

Твій fingerprint: `f70960a065ba4f4e2051a125021efffacb4f7...`

1. Відкрити QZ Tray **Settings**
2. **Advanced → Signing**
3. Додати цей fingerprint в **Trusted Certificates**

---

## Перевірка

Після додавання в довірені:
1. Перезапустити QZ Tray (Exit → запустити)
2. Ctrl+Shift+R в браузері
3. Натиснути "Знайти принтери"
4. Має працювати БЕЗ підтверджень і БЕЗ "Invalid Signature"

---

## Для продакшену (опціонально)

Якщо потрібен повністю довірений сертифікат без цих маніпуляцій:
- Купити сертифікат від CA (наприклад Let's Encrypt безкоштовно)
- Підписати власним корпоративним CA
- Використовувати комерційний сертифікат

Але для внутрішнього використання **самопідписаний + додати в QZ Tray** цілком достатньо.

