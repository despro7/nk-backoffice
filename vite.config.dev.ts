import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "./server";
// import { cronService, forceStopAllCronJobs } from "./server/services/cronService.js"; - No longer needed here

const disableHmr = process.env.VITE_DISABLE_HMR === "1";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Після блокування екрана телефона WS HMR падає і Vite робить location.reload().
    // Для прогону на LAN: VITE_DISABLE_HMR=1 npm run dev
    hmr: disableHmr ? false : undefined,
    fs: {
      // Корінь проєкту потрібен для index.html; client/shared уже всередині нього
      allow: [path.resolve(__dirname)],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/client",
  },
  plugins: [react(), expressPlugin(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "1.0.0"),
    "process.env.NODE_ENV": JSON.stringify(mode),
    "process.env.CLIENT_URL": JSON.stringify(process.env.CLIENT_URL),
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve",
    configureServer(server) {
      const app = createServer();
      server.middlewares.use(app);
      // Cron job cleanup is now handled by the server module itself on reload,
      // so no specific HMR handling is needed here anymore.
    },
  };
}
