/** PhotoSwipe монтує `.pswp` у DOM; кліки по ньому не мають закривати Drawer/Modal. */
export function isEventFromPhotoSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.pswp'));
}

export function isPhotoSwipeOpen(): boolean {
  return document.documentElement.dataset.photoswipeOpen === '1';
}

export function markPhotoSwipeOpen(): void {
  document.documentElement.dataset.photoswipeOpen = '1';
}

export function markPhotoSwipeClosed(): void {
  delete document.documentElement.dataset.photoswipeOpen;
}

/** HeroUI Drawer: не закривати картку під час lightbox. */
export function shouldDismissOverlayWhilePhotoSwipeOpen(target: EventTarget | null): boolean {
  if (isPhotoSwipeOpen()) return false;
  if (isEventFromPhotoSwipe(target)) return false;
  return true;
}
