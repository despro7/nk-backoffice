import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "./index.js";
import * as express from "express";
import { cronService } from "./services/cronService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = createServer();
const port = process.env.PORT || 3001;

const distPath = path.join(__dirname, "../client");

// Статические файлы
app.use(express.static(distPath));

// SPA fallback
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  const processId = process.pid;
  console.log(`🚀 Server running on port ${port} (PID: ${processId})`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
  
  // Проверяем, не запущены ли уже cron-задачи (для node-build.ts они не нужны)
  const status = cronService.getStatus();
  if (status.hasSyncJob) {
    console.log('⚠️ Cron tasks detected in node-build mode - stopping them');
    cronService.stopAll();
  }
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n🛑 ${signal} received, shutting down...`);
  
  // Останавливаем cron-задачи если они запущены
  const status = cronService.getStatus();
  if (status.hasSyncJob) {
    console.log('🛑 Stopping cron tasks...');
    cronService.stopAll();
  }
  
  setTimeout(() => process.exit(0), 1000);
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));