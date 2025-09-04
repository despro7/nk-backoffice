import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "./index";
import * as express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = createServer();
const port = process.env.PORT || 3001;

const distPath = path.join(__dirname, "../spa");

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
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n🛑 ${signal} received, shutting down...`);
  setTimeout(() => process.exit(0), 1000);
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));