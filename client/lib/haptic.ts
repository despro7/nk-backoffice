/** Short pulse. Implemented on Android via Vibration API; a no-op on iOS Safari. */
export function lightHaptic() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Vibration API is missing or blocked.
  }
}
