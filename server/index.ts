import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import protectedRoutes from "./routes/protected";
import ordersRoutes from "./routes/orders";
import productsRoutes from "./routes/products";
import boxesRoutes from "./routes/boxes";
import settingsRoutes from "./routes/settings";
import webhookRoutes from './routes/webhooks';
import warehouseRoutes from './routes/warehouse';
import ordersSyncRoutes from './routes/orders-sync';
import { cronService } from './services/cronService';
import { logServer } from '../client/lib/utils';
import shippingRoutes from './routes/shipping';

// Увеличиваем лимит listeners для process events
process.setMaxListeners(20);

export function createServer() {
  const app = express();

  // Middleware - CORS с поддержкой credentials
  const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:5173', // Vite dev server
    'http://localhost:8080', // Дополнительный dev server
    'https://localhost:3000',
    'https://localhost:5173',
    'https://localhost:8080'
  ];

  const loggedOrigins = new Set();

  app.use(cors({
    origin: (origin, callback) => {
      // Логируем только один раз для каждого origin
      const key = origin || 'no-origin';
      if (!loggedOrigins.has(key)) {
        logServer(`✅ CORS: Allowed ${key}`);
        loggedOrigins.add(key);
      }
      
      // Разрешаем запросы без origin
      if (!origin) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logServer(`🚫 CORS: Blocked origin ${origin}`); // это оставить!
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Обязательно для cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['Set-Cookie']
  }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Логирование для диагностики
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.headers['content-type']?.includes('application/json')) {
      logServer('📥 Входящий JSON запрос:', {
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        bodyLength: req.body ? Object.keys(req.body).length : 0
      });
    }
    next();
  });

  // Auth routes
  app.use("/api/auth", authRoutes);

  // Protected routes
  app.use("/api/protected", protectedRoutes);

  // Orders routes
  app.use("/api/orders", ordersRoutes);

  // Orders sync routes
  app.use("/api/orders", ordersSyncRoutes);

  // Products routes
  app.use("/api/products", productsRoutes);

  // Boxes routes
  app.use("/api/boxes", boxesRoutes);

  // Settings routes
  app.use("/api/settings", settingsRoutes);

  // Warehouse routes
  app.use("/api/warehouse", warehouseRoutes);

  // Webhook routes (должны быть до protected routes)
  app.use('/api/webhooks', webhookRoutes);

  // Добавляем роуты для работы с перевозчиками
  app.use('/api/shipping', shippingRoutes);

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  return app;
}

// Запускаем сервер если файл запущен напрямую
const app = createServer();
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`\n\n🚀 Server is running on http://localhost:${port}`);
  console.log(`🌐 CORS allowed origins: ${[
    '\n    ' + process.env.CLIENT_URL || 
    '\n    http://localhost:3000',
    '\n    http://localhost:3000',
    '\n    http://localhost:5173',
    '\n    http://localhost:8080',
    '\n    https://localhost:3000',
    '\n    https://localhost:5173',
    '\n    https://localhost:8080'
  ].join(', ')}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET   /api/ping`);
  console.log(`   GET   /api/orders`);
  console.log(`   GET   /api/orders/test`);
  console.log(`   POST  /api/orders/sync`);
  console.log(`   GET   /api/orders/stats/summary (from local DB)`);
  console.log(`   GET   /api/orders/raw/all`);
  console.log(`   POST  /api/webhooks/salesdrive/order-update`);
  console.log(`   GET   /api/webhooks/salesdrive/health`);
  
  // Запускаем cron-задачи
  cronService.startAll();
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n🛑 ${signal} received, shutting down...`);
  cronService.stopAll();
  setTimeout(() => process.exit(0), 2000);
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));