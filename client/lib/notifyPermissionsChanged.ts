export const PERMISSIONS_REVISION_EVENT = 'nk-roles-updated';
export const PERMISSIONS_REVISION_STORAGE_KEY = 'nk-permissions-revision';

/** Сигнал іншим вкладкам і поточному UI, що матрицю ролей змінено. */
export function notifyPermissionsChanged(): void {
  window.dispatchEvent(new Event(PERMISSIONS_REVISION_EVENT));
  try {
    localStorage.setItem(PERMISSIONS_REVISION_STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore quota / private mode
  }
}
