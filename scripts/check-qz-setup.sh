#!/bin/bash

# Скрипт для перевірки налаштування QZ Tray на сервері

echo "🔍 Перевірка налаштування QZ Tray"
echo ""

# 1. Перевірити файли сертифікатів
echo "📁 Перевірка файлів сертифікатів:"
if [ -f "certificates/private-key.pem" ]; then
    echo "  ✓ private-key.pem існує"
    ls -lh certificates/private-key.pem
else
    echo "  ✗ private-key.pem НЕ ЗНАЙДЕНО!"
fi

if [ -f "certificates/digital-certificate.pem" ]; then
    echo "  ✓ digital-certificate.pem існує"
    ls -lh certificates/digital-certificate.pem
else
    echo "  ✗ digital-certificate.pem НЕ ЗНАЙДЕНО!"
fi

echo ""

# 2. Перевірити чи збігаються сертифікат і ключ
echo "🔑 Перевірка відповідності ключа і сертифіката:"
if [ -f "certificates/private-key.pem" ] && [ -f "certificates/digital-certificate.pem" ]; then
    CERT_MODULUS=$(openssl x509 -noout -modulus -in certificates/digital-certificate.pem | openssl md5)
    KEY_MODULUS=$(openssl rsa -noout -modulus -in certificates/private-key.pem | openssl md5)
    
    echo "  Cert MD5: $CERT_MODULUS"
    echo "  Key MD5:  $KEY_MODULUS"
    
    if [ "$CERT_MODULUS" = "$KEY_MODULUS" ]; then
        echo "  ✓ Ключ і сертифікат ВІДПОВІДАЮТЬ один одному"
    else
        echo "  ✗ Ключ і сертифікат НЕ ВІДПОВІДАЮТЬ! Потрібно перегенерувати."
    fi
else
    echo "  ⚠ Неможливо перевірити - файли відсутні"
fi

echo ""

# 3. Показати інформацію про сертифікат
echo "📜 Інформація про сертифікат:"
if [ -f "certificates/digital-certificate.pem" ]; then
    openssl x509 -in certificates/digital-certificate.pem -noout -subject -issuer -dates
else
    echo "  ⚠ Сертифікат не знайдено"
fi

echo ""

# 4. Тест підпису
echo "🧪 Тест підпису повідомлення:"
if [ -f "certificates/private-key.pem" ]; then
    TEST_MESSAGE="test message for qz tray"
    TEST_SIGNATURE=$(echo -n "$TEST_MESSAGE" | openssl dgst -sha256 -sign certificates/private-key.pem | base64)
    
    if [ ! -z "$TEST_SIGNATURE" ]; then
        echo "  ✓ Підпис успішно створено"
        echo "  Signature (перші 50 символів): ${TEST_SIGNATURE:0:50}..."
    else
        echo "  ✗ Помилка створення підпису"
    fi
else
    echo "  ⚠ Приватний ключ не знайдено"
fi

echo ""

# 5. Перевірити змінні середовища
echo "⚙️  Змінні середовища:"
if grep -q "VITE_QZ_USE_SERVER_SIGNING=true" .env 2>/dev/null; then
    echo "  ✓ VITE_QZ_USE_SERVER_SIGNING=true в .env"
else
    echo "  ✗ VITE_QZ_USE_SERVER_SIGNING не встановлено в .env"
fi

echo ""
echo "✅ Перевірка завершена"

