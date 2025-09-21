import { defineConfig, Plugin, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "./server";
// import { cronService, forceStopAllCronJobs } from "./server/services/cronService.js"; - No longer needed here

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), "./client", "./shared"],
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
