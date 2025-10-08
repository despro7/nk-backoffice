#!/bin/bash

# Скрипт для тестування підключення до QZ Tray

echo "🔌 Тестування підключення до QZ Tray"
echo ""

QZ_HOST="localhost"
QZ_PORT=8182
QZ_URL="http://${QZ_HOST}:${QZ_PORT}"

echo "Перевірка: $QZ_URL"
echo ""

# Спроба підключення
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$QZ_URL" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "000" ]; then
    echo "✅ QZ Tray працює!"
    echo ""
    echo "Статус: $HTTP_CODE"
    
    # Спроба отримати версію
    RESPONSE=$(curl -s "$QZ_URL" 2>/dev/null)
    if [ ! -z "$RESPONSE" ]; then
        echo "Відповідь: $RESPONSE"
    fi
    
    echo ""
    echo "🎉 Все працює! Можна використовувати QZ Tray"
else
    echo "❌ QZ Tray не відповідає"
    echo ""
    echo "Можливі причини:"
    echo "  1. QZ Tray не запущено на клієнтських машинах"
    echo "  2. QZ Tray працює на іншому порту"
    echo "  3. Фаєрвол блокує з'єднання"
    echo ""
    echo "Рішення:"
    echo "  - Запустіть QZ Tray на клієнтській машині"
    echo "  - Перевірте що немає інших програм на порту 8182"
    echo "  - Спробуйте відкрити $QZ_URL в браузері на клієнтській машині"
    echo ""
    
    # Додаткова діагностика
    echo "🔍 Додаткова діагностика:"
    echo ""
    
    # Перевірка порту
    echo "Перевірка порту $QZ_PORT..."
    if command -v nc &> /dev/null; then
        if nc -z "$QZ_HOST" "$QZ_PORT" 2>/dev/null; then
            echo "✓ Порт $QZ_PORT відкритий"
        else
            echo "✗ Порт $QZ_PORT закритий або недоступний"
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tln | grep -q ":$QZ_PORT "; then
            echo "✓ Порт $QZ_PORT слухає"
        else
            echo "✗ Порт $QZ_PORT не слухає"
        fi
    else
        echo "⚠ Неможливо перевірити порт (nc або netstat не знайдено)"
    fi
    
    exit 1
fi

