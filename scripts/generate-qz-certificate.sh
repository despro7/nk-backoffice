#!/bin/bash

# Скрипт для генерації самопідписаного сертифіката для QZ Tray (Linux)

echo "🔐 Генерація сертифіката для QZ Tray"
echo ""

# Перевірити наявність OpenSSL
if ! command -v openssl &> /dev/null; then
    echo "✗ OpenSSL не знайдено!"
    echo ""
    echo "Встановіть OpenSSL:"
    echo "  Ubuntu/Debian: sudo apt-get install openssl"
    echo "  CentOS/RHEL: sudo yum install openssl"
    exit 1
fi

OPENSSL_VERSION=$(openssl version)
echo "✓ OpenSSL знайдено: $OPENSSL_VERSION"

# Створити папку для сертифікатів
CERT_DIR="certificates"
if [ ! -d "$CERT_DIR" ]; then
    mkdir -p "$CERT_DIR"
    echo "✓ Створено папку: $CERT_DIR"
fi

# Параметри сертифіката
KEY_FILE="$CERT_DIR/private-key.pem"
CSR_FILE="$CERT_DIR/certificate.csr"
CERT_FILE="$CERT_DIR/digital-certificate.crt"
CERT_PEM_FILE="$CERT_DIR/digital-certificate.pem"

echo ""
echo "📝 Налаштування сертифіката:"
read -p "Країна (2 літери, наприклад UA): " COUNTRY
read -p "Область/Штат: " STATE
read -p "Місто: " CITY
read -p "Назва організації: " ORGANIZATION
read -p "Підрозділ (можна залишити порожнім): " ORG_UNIT
read -p "Common Name (наприклад, localhost або домен): " COMMON_NAME
read -p "Email: " EMAIL

# Якщо OU пустий, використати значення за замовчуванням
if [ -z "$ORG_UNIT" ]; then
    ORG_UNIT="IT Department"
fi

# Створити конфігураційний файл для OpenSSL
CONFIG_FILE="$CERT_DIR/openssl.cnf"
cat > "$CONFIG_FILE" << EOF
[req]
distinguished_name = req_distinguished_name
prompt = no

[req_distinguished_name]
C = $COUNTRY
ST = $STATE
L = $CITY
O = $ORGANIZATION
OU = $ORG_UNIT
CN = $COMMON_NAME
emailAddress = $EMAIL
EOF

echo ""
echo "🔑 Крок 1/4: Генерація приватного ключа..."
openssl genrsa -out "$KEY_FILE" 2048 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ Приватний ключ створено: $KEY_FILE"
else
    echo "✗ Помилка створення приватного ключа"
    exit 1
fi

echo ""
echo "📄 Крок 2/4: Створення запиту на сертифікат (CSR)..."
openssl req -new -key "$KEY_FILE" -out "$CSR_FILE" -config "$CONFIG_FILE" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ CSR створено: $CSR_FILE"
else
    echo "✗ Помилка створення CSR"
    exit 1
fi

echo ""
echo "🎫 Крок 3/4: Генерація самопідписаного сертифіката..."
openssl x509 -req -days 365 -in "$CSR_FILE" -signkey "$KEY_FILE" -out "$CERT_FILE" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ Сертифікат створено: $CERT_FILE"
else
    echo "✗ Помилка створення сертифіката"
    exit 1
fi

echo ""
echo "🔄 Крок 4/4: Конвертація в PEM формат..."
openssl x509 -in "$CERT_FILE" -out "$CERT_PEM_FILE" -outform PEM 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ PEM сертифікат створено: $CERT_PEM_FILE"
else
    echo "✗ Помилка конвертації"
    exit 1
fi

# Видалити тимчасові файли
rm -f "$CSR_FILE" "$CONFIG_FILE"

# Встановити правильні права доступу
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE" "$CERT_PEM_FILE"

echo ""
echo "✅ Сертифікат успішно згенеровано!"
echo ""
echo "📁 Створені файли:"
echo "  - Приватний ключ: $KEY_FILE (права: 600)"
echo "  - Сертифікат (CRT): $CERT_FILE (права: 644)"
echo "  - Сертифікат (PEM): $CERT_PEM_FILE (права: 644)"
echo ""
echo "⚠️  ВАЖЛИВО:"
echo "  1. НЕ додавайте ці файли в git!"
echo "  2. Тримайте приватний ключ в безпеці!"
echo "  3. Для продакшену краще використовувати комерційний сертифікат"
echo ""
echo "📝 Наступні кроки:"
echo "  1. Перезапустіть сервер Node.js"
echo "  2. Перезапустіть QZ Tray на клієнтських машинах"
echo ""

# Показати вміст сертифіката
echo "🔍 Інформація про сертифікат:"
openssl x509 -in "$CERT_PEM_FILE" -noout -text | grep -E "Subject:|Issuer:|Not Before|Not After"

