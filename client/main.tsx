import { createRoot } from "react-dom/client";
import setupLocatorUI from "@locator/runtime";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.DEV) {
  document.documentElement.dataset.locatorMouseModifiers = "meta+shift";
	setupLocatorUI({
    targets: {
      cursor: "cursor://file/${projectPath}${filePath}:${line}:${column}",
    },
  });
}