import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import authSettingsRoutes from "./routes/auth-settings.js";
import protectedRoutes from "./routes/protected.js";
import ordersRoutes from "./routes/orders.js";
import productsRoutes from "./routes/products.js";
import boxesRoutes from "./routes/boxes.js";
import settingsRoutes from "./routes/settings.js";
import webhookRoutes from './routes/webhooks.js';
import warehouseRoutes from './routes/warehouse.js';
import ordersSyncRoutes from './routes/orders-sync.js';
import { cronService, forceStopAllCronJobs } from './services/cronService.js';
import { logServer } from './lib/utils.js';
import shippingRoutes from './routes/shipping.js';
import shippingProvidersRoutes from './routes/shipping-providers.js';
import qzTrayRoutes from './routes/qz-tray.js';
import { dilovodRouter } from './routes/dilovod.js';

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

      // Разрешаем запросы без origin (для webhook от внешних сервисов)
      if (!origin) {
        return callback(null, true);
      }

      // Специально разрешаем webhook запросы от SalesDrive
      if (key === 'no-origin' || key.includes('salesdrive') || key.includes('webhook')) {
        logServer(`✅ CORS: Webhook allowed for ${key}`);
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
  app.use(express.json({
    verify: (req, res, buf) => {
      if (req.url.includes('/webhooks/')) {
        console.log('📦 Webhook raw body length:', buf.length);
        console.log('📦 Webhook raw body preview:', buf.toString().substring(0, 200));
      }
    }
  }));
  app.use(express.urlencoded({ extended: true }));
  
  // Глобальная диагностика всех PUT/POST запросов
  app.use((req, res, next) => {
    if ((req.method === 'PUT' || req.method === 'POST') && req.url.includes('/api/settings/')) {
      logServer('📥 Settings API request:', {
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        bodyType: typeof req.body,
        bodyKeys: Object.keys(req.body || {}),
        hasBody: !!req.body,
        bodyLength: req.body ? JSON.stringify(req.body).length : 0
      });
    }
    next();
  });


  // Auth routes
  app.use("/api/auth", authRoutes);
  app.use("/api/auth", authSettingsRoutes);

  // Protected routes
  app.use("/api/protected", protectedRoutes);

  // Orders routes
  app.use("/api/orders", ordersRoutes);

  // Orders sync routes (separate prefix to avoid conflicts)
  app.use("/api/orders-sync", ordersSyncRoutes);

  // Products routes
  app.use("/api/products", productsRoutes);

  // Boxes routes
  app.use("/api/boxes", boxesRoutes);

  // Settings routes (все роуты в settings.ts, включая /logging и /toast)
  app.use("/api/settings", settingsRoutes);

  // Warehouse routes
  app.use("/api/warehouse", warehouseRoutes);

  // Webhook routes (должны быть до protected routes)
  app.use('/api/webhooks', webhookRoutes);

  // Добавляем роуты для работы с перевозчиками
  app.use('/api/shipping', shippingRoutes);
  app.use('/api/shipping-providers', shippingProvidersRoutes);

  // QZ Tray routes
  app.use("/api/qz-tray", qzTrayRoutes);

  // Dilovod routes
  app.use("/api/dilovod", dilovodRouter);

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  // Health check endpoint for server status monitoring
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.version
    });
  });

  return app;
}

// Запускаем сервер если файл запущен напрямую
const app = createServer();
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`\n🚀 Server is running on http://localhost:${port}`);
  console.log(`\n📋 Available API endpoints:`);
  console.log(`   GET   /api/health`);
  console.log(`   GET   /api/orders`);
  console.log(`   GET   /api/orders/test`);
  console.log(`   POST  /api/orders/sync`);
  console.log(`   GET   /api/orders/stats/summary (from local DB)`);
  console.log(`   GET   /api/orders/raw/all`);
  console.log(`   POST  /api/webhooks/salesdrive/order-update`);
  console.log(`   POST  /api/webhooks/salesdrive/test`);
  console.log(`   GET   /api/webhooks/salesdrive/health`);
  
  // Start cron jobs after ensuring any old ones are stopped.
  console.log('🚀 Starting cron tasks...');
  forceStopAllCronJobs(); // Clean up any orphaned jobs from previous runs
  cronService.startAll(); // Start new jobs
});

// Graceful shutdown
// Attach shutdown handlers only once per process lifetime to avoid HMR duplication.
if (!(process as any).__SHUTDOWN_HANDLER_ATTACHED__) {
  const shutdown = (signal: string) => {
    console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

    // Используем глобальную функцию, чтобы гарантированно остановить все задачи
    forceStopAllCronJobs();

    // Даем небольшую задержку для завершения логов перед выходом
    setTimeout(() => process.exit(0), 200);
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  (process as any).__SHUTDOWN_HANDLER_ATTACHED__ = true;
  // console.log('🔧 Shutdown handlers attached.');
}