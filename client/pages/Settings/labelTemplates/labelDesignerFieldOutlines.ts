const STORAGE_KEY = 'labelDesignerHideFieldOutlines';

/** Приховати пунктирні outline-рамки полів у pdfme Designer (лише візуально). */
export function readLabelDesignerHideFieldOutlines(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLabelDesignerHideFieldOutlines(hide: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, hide ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}
