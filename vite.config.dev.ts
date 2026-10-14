import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import locatorBabelJsx from "@locator/babel-jsx";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import type { Application } from "express";

const disableHmr = process.env.VITE_DISABLE_HMR === "1";
const projectRoot = __dirname;
const serverRoot = path.join(projectRoot, "server");
const sharedRoot = path.join(projectRoot, "shared");

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // cloudflared / localtunnel передають свій Host — інакше Vite відповідає 403
    allowedHosts: [
      "chatwoot-dev.nk-food.shop",
      ".trycloudflare.com",
      ".loca.lt",
      ".ngrok-free.app",
      ".ngrok.io",
    ],
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
  plugins: [
    react({
      babel: {
        plugins: [
          [
            locatorBabelJsx,
            {
              // path — повний шлях у DOM, працює без window.__LOCATOR_DATA__
              dataAttribute: "path",
            },
          ],
        ],
      },
    }),
    expressPlugin(),
    tailwindcss(),
  ],
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
  optimizeDeps: {
    // Після зміни compiler-плагіна (SWC → Babel) кеш deps застаріває → 504 Outdated Optimize Dep
    include: [
      "modern-screenshot",
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-dev-runtime",
      "@locator/runtime",
    ],
  },
}));

function shouldReloadExpressBackend(file: string): boolean {
  const normalized = path.normalize(file);
  return (
    normalized.startsWith(serverRoot + path.sep) ||
    normalized.startsWith(sharedRoot + path.sep)
  );
}

function expressPlugin(): Plugin {
  let expressApp: Application | undefined;

  async function reloadExpressApp(vite: ViteDevServer): Promise<void> {
    const mod = await vite.ssrLoadModule("/server/index.ts");
    const createServer = mod.createServer as () => Application;
    expressApp = createServer();
  }

  return {
    name: "express-plugin",
    apply: "serve",
    async configureServer(vite) {
      await reloadExpressApp(vite);

      vite.middlewares.use((req, res, next) => {
        if (!expressApp) {
          next();
          return;
        }
        expressApp(req, res, next);
      });

      vite.watcher.on("change", async (file) => {
        if (!shouldReloadExpressBackend(file)) return;
        try {
          await reloadExpressApp(vite);
          vite.config.logger.info("[express-plugin] backend reloaded", {
            timestamp: true,
          });
        } catch (err) {
          vite.config.logger.error(`[express-plugin] backend reload failed: ${err}`);
        }
      });
    },
  };
}
