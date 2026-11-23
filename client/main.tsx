import { createRoot } from "react-dom/client";
import setupLocatorUI from "@locator/runtime";
import App from "./App";
import { installStaleChunkRecovery } from "./lib/staleChunkRecovery";

installStaleChunkRecovery();

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.DEV) {
  setupDevLocator();
}

/**
 * LocatorJS (лише DEV): Option+Cmd+клік відкриває компонент у редакторі.
 * Посилання `cursor://` відкриваємо через `/__open-in-editor` dev-сервера Vite (редактор: `LAUNCH_EDITOR`),
 * бо вбудований браузер Claude не передає custom-протоколи в застосунок.
 */
function setupDevLocator() {
  document.documentElement.dataset.locatorMouseModifiers = "alt+meta";

  // Без інтро-банера і вікна вибору редактора (кожен браузер має своє сховище)
  try {
    const raw = localStorage.getItem("LOCATOR_OPTIONS");
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (stored.showIntro !== false || stored.welcomeScreenDismissed !== true) {
      localStorage.setItem(
        "LOCATOR_OPTIONS",
        JSON.stringify({ ...stored, showIntro: false, welcomeScreenDismissed: true }),
      );
    }
  } catch {
    // localStorage недоступний: Locator покаже інтро, не критично
  }

  const CURSOR_PREFIX = "cursor://file/";
  const nativeOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url == null ? "" : String(url);
    if (href.startsWith(CURSOR_PREFIX)) {
      const file = decodeURIComponent(href.slice(CURSOR_PREFIX.length));
      void fetch(`/__open-in-editor?file=${encodeURIComponent(file)}`).catch(() => undefined);
      return null;
    }
    return nativeOpen(url, target, features);
  }) as typeof window.open;

  setupLocatorUI({
    showIntro: false,
    targets: {
      cursor: "cursor://file/${projectPath}${filePath}:${line}:${column}",
    },
  });

  moveLocatorOutlineToolbarBelow();
}

/**
 * Панелька іконок (дерево / список / копіювати) стоїть над підсвіченим елементом і налазить
 * на назву компонента; переносимо її під рамку елемента. UI Locator живе в shadow root,
 * тому стиль додаємо туди, коли runtime його створить.
 */
function moveLocatorOutlineToolbarBelow(attempt = 0) {
  const shadow = document.getElementById("locatorjs-wrapper")?.shadowRoot;
  if (!shadow) {
    if (attempt < 50) window.setTimeout(() => moveLocatorOutlineToolbarBelow(attempt + 1), 100);
    return;
  }
  if (shadow.getElementById("nk-locator-overrides")) return;
  const style = document.createElement("style");
  style.id = "nk-locator-overrides";
  // Впритул до рамки (з невеликим наліпанням): курсор з елемента одразу потрапляє на панельку,
  // без проміжку над сусіднім елементом, який перехопив би підсвітку.
  style.textContent = ".bg-black\\/60 { top: calc(100% - 2px) !important; bottom: auto !important; }";
  shadow.appendChild(style);
}
