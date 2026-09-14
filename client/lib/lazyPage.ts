import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type LazyPageComponent = LazyExoticComponent<ComponentType<Record<string, unknown>>>;

/** Lazy-load сторінки з default export для code-splitting по маршрутах. */
export function lazyPage(
  factory: () => Promise<{ default: ComponentType }>,
): LazyPageComponent {
  return lazy(factory);
}
