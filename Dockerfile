# Используем официальный Node.js образ
FROM node:18-alpine

# Устанавливаем dumb-init для правильной обработки сигналов
RUN apk add --no-cache dumb-init

# Создаем рабочую директорию
WORKDIR /app

# Копируем package файлы
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Устанавливаем зависимости
RUN npm ci --only=production && npm cache clean --force

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build:production

# Создаем пользователя без root прав
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Меняем владельца файлов
RUN chown -R nextjs:nodejs /app
USER nextjs

# Открываем порт
EXPOSE 3001

# Используем dumb-init для правильной обработки сигналов
ENTRYPOINT ["dumb-init", "--"]

# Запускаем приложение
CMD ["npm", "start"]