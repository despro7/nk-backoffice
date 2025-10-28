import { useContext } from "react";
import { ServerStatusContext } from "./ServerStatusContext";

// Тепер цей хук просто делегує контекст
export function useServerStatus() {
  const ctx = useContext(ServerStatusContext);
  if (!ctx) throw new Error("useServerStatus must be used within ServerStatusProvider");
  return ctx;
}
