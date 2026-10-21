import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { waitForReload } from './staleChunkRecovery';

export type LazyPageComponent = LazyExoticComponent<ComponentType<Record<string, unknown>>>;

/** Lazy-load сторінки з default export для code-splitting по маршрутах. */
export function lazyPage(
  factory: () => Promise<{ default: ComponentType }>,
): LazyPageComponent {
  // Після preventDefault у vite:preloadError import повертає undefined – сторінка вже перезавантажується.
  return lazy(() => factory().then((module) => module ?? waitForReload<{ default: ComponentType }>()));
}
